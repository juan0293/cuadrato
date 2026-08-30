import { Injectable } from '@angular/core';
import { Factura } from '../models/factura.model';
import { PrinterConfiguration } from '../models/printer-configuration.model';
import { ThermalPrinterService } from './thermal-printer.service';

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: string | number;
}

interface SerialOpenOptionsLike {
  baudRate: number;
  dataBits: 8;
  stopBits: 1;
  parity: 'none';
  bufferSize?: number;
  flowControl: 'none' | 'hardware';
}

interface SerialPortLike {
  readonly readable?: ReadableStream<Uint8Array> | null;
  readonly writable?: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfoLike;
  open(options: SerialOpenOptionsLike): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  close(): Promise<void>;
}

interface SerialApiLike {
  requestPort(options?: {
    filters?: Array<{ bluetoothServiceClassId: string }>;
  }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export interface WebSerialPrinterSelection {
  name: string;
  identityAvailable: boolean;
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: string;
}

@Injectable({ providedIn: 'root' })
export class WebSerialPrinterService {
  private readonly bluetoothSerialProfileUuid = '00001101-0000-1000-8000-00805f9b34fb';
  private selectedPort?: SerialPortLike;

  constructor(private readonly receiptService: ThermalPrinterService) {}

  get supported(): boolean {
    return Boolean(this.serialApi);
  }

  async selectPrinter(mode: 'bluetooth-spp' | 'usb-com' = 'bluetooth-spp'): Promise<WebSerialPrinterSelection> {
    this.assertAvailable();
    const port = mode === 'bluetooth-spp'
      ? await this.serialApi!.requestPort({
          filters: [{ bluetoothServiceClassId: this.bluetoothSerialProfileUuid }],
        })
      : await this.serialApi!.requestPort();
    this.selectedPort = port;
    return this.describePort(port);
  }

  async printTest(configuration: PrinterConfiguration): Promise<void> {
    await this.write(this.receiptService.buildTestBytes(configuration), configuration);
  }

  async printInvoice(factura: Factura, configuration: PrinterConfiguration): Promise<void> {
    const bytes = await this.receiptService.buildInvoiceBytes(factura, configuration);
    for (let copy = 0; copy < configuration.copies; copy += 1) {
      await this.write(bytes, configuration);
    }
  }

  getFriendlyError(error: unknown): string {
    const name = String((error as { name?: unknown })?.name || '');
    const message = String((error as Error)?.message || '');
    if (message === 'WEB_SERIAL_UNAVAILABLE') {
      return 'Este navegador no permite impresión serial. Usa Chrome o Edge actualizado en una computadora.';
    }
    if (message === 'WEB_SECURE_CONTEXT_REQUIRED') {
      return 'La conexión con impresoras web requiere abrir la PWA mediante HTTPS.';
    }
    if (message === 'WEB_SERIAL_NOT_SELECTED') {
      return 'Selecciona la impresora Bluetooth/Serial desde la configuración.';
    }
    if (message === 'WEB_SERIAL_RESELECT_REQUIRED') {
      return 'El navegador no puede identificar este puerto después de recargar. Selecciona nuevamente el puerto saliente de la 2C-P58-C.';
    }
    if (message === 'WEB_SERIAL_WRITE_UNAVAILABLE') {
      return 'El puerto seleccionado no permite escritura. Selecciona el puerto serial saliente de la impresora.';
    }
    if (message === 'WEB_SERIAL_OPEN_FAILED') {
      return 'Chrome no pudo abrir el canal de impresión. Apaga y enciende la impresora, cierra programas de impresión y selecciona el puerto COM saliente; el COM entrante no permite imprimir.';
    }
    if (name === 'NotFoundError') return 'No se seleccionó ninguna impresora.';
    if (name === 'NetworkError') return 'No fue posible abrir el puerto. Cierra otras aplicaciones que estén usando la impresora.';
    if (name === 'InvalidStateError') return 'La impresora ya está siendo utilizada por otra aplicación o pestaña.';
    return 'No fue posible imprimir desde el navegador mediante el puerto serial.';
  }

  private async write(bytes: Uint8Array, configuration: PrinterConfiguration): Promise<void> {
    this.assertAvailable();
    const port = await this.resolvePort(configuration);
    let openedHere = false;
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    try {
      if (!port.writable) {
        const openOptions: SerialOpenOptionsLike = {
          baudRate: configuration.webSerialBaudRate || 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          bufferSize: 4096,
          flowControl: configuration.webSerialFlowControl || 'none',
        };
        await this.openWithRetry(port, openOptions);
        openedHere = true;
      }
      if (!port.writable) throw new Error('WEB_SERIAL_WRITE_UNAVAILABLE');
      if (port.setSignals) {
        try {
          await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        } catch {
          // Algunos adaptadores Bluetooth SPP no exponen estas señales.
        }
      }
      writer = port.writable.getWriter();
      for (let offset = 0; offset < bytes.length; offset += 256) {
        await writer.write(bytes.slice(offset, offset + 256));
        if (offset + 256 < bytes.length) await this.delay(20);
      }
      await writer.ready;
      // Las impresoras Bluetooth económicas necesitan tiempo para vaciar el búfer
      // antes de que Chrome cierre el puerto virtual.
      await this.delay(700);
    } finally {
      writer?.releaseLock();
      if (openedHere) {
        try {
          await port.close();
        } catch {
          // El siguiente trabajo volverá a resolver/abrir el puerto.
        }
      }
    }
  }

  private async resolvePort(configuration: PrinterConfiguration): Promise<SerialPortLike> {
    if (this.selectedPort && this.matches(this.selectedPort, configuration)) return this.selectedPort;
    const granted = await this.serialApi!.getPorts();
    const hasPersistableIdentity = Boolean(
      configuration.webSerialBluetoothServiceClassId
      || configuration.webSerialUsbVendorId !== undefined,
    );
    if (!hasPersistableIdentity) throw new Error('WEB_SERIAL_RESELECT_REQUIRED');
    const matching = granted.find((port) => this.matches(port, configuration));
    if (!matching) throw new Error('WEB_SERIAL_NOT_SELECTED');
    this.selectedPort = matching;
    return matching;
  }

  private matches(port: SerialPortLike, configuration: PrinterConfiguration): boolean {
    const info = port.getInfo();
    if (configuration.webSerialBluetoothServiceClassId) {
      return String(info.bluetoothServiceClassId || '') === configuration.webSerialBluetoothServiceClassId;
    }
    if (configuration.webSerialUsbVendorId !== undefined) {
      return info.usbVendorId === configuration.webSerialUsbVendorId
        && (configuration.webSerialUsbProductId === undefined || info.usbProductId === configuration.webSerialUsbProductId);
    }
    return true;
  }

  private describePort(port: SerialPortLike): WebSerialPrinterSelection {
    const info = port.getInfo();
    const bluetoothServiceClassId = info.bluetoothServiceClassId === undefined
      ? undefined
      : String(info.bluetoothServiceClassId);
    const isBluetooth = Boolean(bluetoothServiceClassId);
    const identityAvailable = info.usbVendorId !== undefined || isBluetooth;
    const id = info.usbVendorId !== undefined
      ? `VID ${info.usbVendorId} / PID ${info.usbProductId ?? '—'}`
      : bluetoothServiceClassId;
    return {
      name: identityAvailable
        ? `${isBluetooth ? 'Bluetooth SPP' : 'Puerto serial USB'} · ${id}`
        : 'Puerto serial autorizado (identidad no disponible)',
      identityAvailable,
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId,
      bluetoothServiceClassId,
    };
  }

  private assertAvailable(): void {
    if (!window.isSecureContext) throw new Error('WEB_SECURE_CONTEXT_REQUIRED');
    if (!this.serialApi) throw new Error('WEB_SERIAL_UNAVAILABLE');
  }

  private get serialApi(): SerialApiLike | undefined {
    return (window.navigator as Navigator & { serial?: SerialApiLike }).serial;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private async openWithRetry(port: SerialPortLike, options: SerialOpenOptionsLike): Promise<void> {
    try {
      await port.open(options);
    } catch (firstError) {
      if (String((firstError as { name?: unknown })?.name || '') !== 'NetworkError') throw firstError;
      if (port.writable) return;
      await this.delay(600);
      try {
        await port.open(options);
      } catch (secondError) {
        throw Object.assign(new Error('WEB_SERIAL_OPEN_FAILED'), { cause: secondError });
      }
    }
  }
}
