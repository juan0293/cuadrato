import { Injectable } from '@angular/core';
import { Factura } from '../models/factura.model';
import { PrinterConfiguration } from '../models/printer-configuration.model';
import { ThermalPrinterService } from './thermal-printer.service';

interface WebUsbEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}

interface WebUsbAlternate {
  endpoints: WebUsbEndpoint[];
}

interface WebUsbInterface {
  interfaceNumber: number;
  alternate: WebUsbAlternate;
  alternates: WebUsbAlternate[];
}

interface WebUsbConfiguration {
  configurationValue: number;
  interfaces: WebUsbInterface[];
}

interface WebUsbDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  opened: boolean;
  configuration?: WebUsbConfiguration;
  configurations: WebUsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: string }>;
}

interface WebUsbApi {
  requestDevice(options: { filters: Array<{ vendorId: number; productId?: number }> }): Promise<WebUsbDevice>;
  getDevices(): Promise<WebUsbDevice[]>;
}

export interface WebUsbPrinterSelection {
  name: string;
  vendorId: number;
  productId: number;
  serialNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class WebUsbPrinterService {
  // Identidad USB observada en la 2C-P58-C / Caysn Thermal Printer.
  private readonly supportedPrinter = { vendorId: 0x4b43, productId: 0x3538 };

  constructor(private readonly receiptService: ThermalPrinterService) {}

  get supported(): boolean {
    return !!this.usb;
  }

  async selectPrinter(): Promise<WebUsbPrinterSelection> {
    const usb = this.requireUsb();
    const device = await usb.requestDevice({ filters: [this.supportedPrinter] });
    return this.describe(device);
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
    const errorName = String((error as { name?: unknown })?.name || '');
    const message = String((error as Error)?.message || error || '');
    if (message === 'WEB_USB_NOT_SELECTED') {
      return 'Autoriza primero la impresora USB desde el botón Buscar impresora USB.';
    }
    if (message === 'WEB_USB_DEVICE_NOT_FOUND') {
      return 'La impresora USB autorizada no está conectada. Revisa el cable y vuelve a buscarla.';
    }
    if (message === 'WEB_USB_ENDPOINT_NOT_FOUND') {
      return 'La impresora no expuso un canal USB de salida compatible con ESC/POS.';
    }
    if (errorName === 'NotFoundError') {
      return 'No se seleccionó ninguna impresora USB.';
    }
    if (errorName === 'NotAllowedError' || message.includes('Access denied')) {
      return 'Chrome no autorizó el dispositivo USB. Abre los permisos del sitio y vuelve a intentarlo.';
    }
    if (errorName === 'NetworkError' || message.includes('claim')) {
      return 'No se pudo tomar control del USB. Cierra QZ Tray y cualquier trabajo de impresión activo, luego intenta otra vez.';
    }
    return 'No fue posible imprimir directamente por WebUSB.';
  }

  private async write(bytes: Uint8Array, configuration: PrinterConfiguration): Promise<void> {
    const vendorId = configuration.webUsbVendorId;
    const productId = configuration.webUsbProductId;
    if (!vendorId || !productId) throw new Error('WEB_USB_NOT_SELECTED');

    const devices = await this.requireUsb().getDevices();
    const device = devices.find((candidate) =>
      candidate.vendorId === vendorId
      && candidate.productId === productId
      && (!configuration.webUsbSerialNumber || candidate.serialNumber === configuration.webUsbSerialNumber));
    if (!device) throw new Error('WEB_USB_DEVICE_NOT_FOUND');

    let interfaceNumber: number | undefined;
    try {
      if (!device.opened) await device.open();
      if (!device.configuration) {
        const configurationValue = device.configurations[0]?.configurationValue;
        if (!configurationValue) throw new Error('WEB_USB_ENDPOINT_NOT_FOUND');
        await device.selectConfiguration(configurationValue);
      }

      const output = this.findOutputEndpoint(device.configuration);
      if (!output) throw new Error('WEB_USB_ENDPOINT_NOT_FOUND');
      interfaceNumber = output.interfaceNumber;
      await device.claimInterface(interfaceNumber);

      for (let offset = 0; offset < bytes.length; offset += 4096) {
        const result = await device.transferOut(output.endpointNumber, bytes.slice(offset, offset + 4096));
        if (result.status !== 'ok') throw new Error(`WEB_USB_TRANSFER_${result.status}`);
      }
    } finally {
      if (interfaceNumber !== undefined && device.opened) {
        try { await device.releaseInterface(interfaceNumber); } catch { /* Ya fue liberada por el sistema. */ }
      }
      if (device.opened) {
        try { await device.close(); } catch { /* Se reabrirá en el próximo trabajo. */ }
      }
    }
  }

  private findOutputEndpoint(configuration?: WebUsbConfiguration): { interfaceNumber: number; endpointNumber: number } | undefined {
    for (const usbInterface of configuration?.interfaces || []) {
      const alternates = usbInterface.alternates?.length ? usbInterface.alternates : [usbInterface.alternate];
      for (const alternate of alternates) {
        const endpoint = alternate?.endpoints?.find((item) => item.direction === 'out' && item.type === 'bulk')
          || alternate?.endpoints?.find((item) => item.direction === 'out');
        if (endpoint) return { interfaceNumber: usbInterface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
      }
    }
    return undefined;
  }

  private describe(device: WebUsbDevice): WebUsbPrinterSelection {
    return {
      name: device.productName || `${device.manufacturerName || 'Impresora'} USB`,
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber,
    };
  }

  private requireUsb(): WebUsbApi {
    if (!this.usb) throw new Error('WEB_USB_UNSUPPORTED');
    return this.usb;
  }

  private get usb(): WebUsbApi | undefined {
    return (navigator as Navigator & { usb?: WebUsbApi }).usb;
  }
}
