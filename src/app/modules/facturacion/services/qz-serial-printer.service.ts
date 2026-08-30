import { Injectable } from '@angular/core';
import * as qz from 'qz-tray';
import { Factura } from '../models/factura.model';
import { PrinterConfiguration } from '../models/printer-configuration.model';
import { ThermalPrinterService } from './thermal-printer.service';

@Injectable({ providedIn: 'root' })
export class QzSerialPrinterService {
  constructor(private readonly receiptService: ThermalPrinterService) {}

  async findPorts(): Promise<string[]> {
    await this.connect();
    return qz.serial.findPorts();
  }

  async findPrinters(): Promise<string[]> {
    await this.connect();
    const printers = await qz.printers.find();
    return Array.isArray(printers) ? printers : printers ? [printers] : [];
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
    const message = String((error as Error)?.message || error || '');
    if (message === 'QZ_PORT_NOT_SELECTED') {
      return 'Selecciona el puerto /dev/cu.2C-P58-C o el COM correspondiente antes de imprimir.';
    }
    if (message === 'QZ_PRINTER_NOT_SELECTED') {
      return 'Selecciona una impresora instalada en el sistema antes de imprimir.';
    }
    if (message.includes('QZ Tray') || message.includes('connect')) {
      return 'No se pudo conectar con QZ Tray. Instálalo, ábrelo y autoriza esta PWA cuando aparezca la solicitud.';
    }
    if (message.includes('Port') || message.includes('port')) {
      return 'QZ Tray no pudo abrir el puerto seleccionado. Cierra otras aplicaciones de impresión y vuelve a buscarlo.';
    }
    if (message.includes('Printer') || message.includes('printer')) {
      return 'QZ Tray no pudo enviar el trabajo a la impresora del sistema. Verifica que esté instalada, encendida y sin trabajos detenidos.';
    }
    return 'No fue posible imprimir mediante el puente local QZ Tray.';
  }

  private async write(bytes: Uint8Array, configuration: PrinterConfiguration): Promise<void> {
    if (configuration.transport === 'qz-printer') {
      await this.writePrinterQueue(bytes, configuration);
      return;
    }

    const port = configuration.qzSerialPort;
    if (!port) throw new Error('QZ_PORT_NOT_SELECTED');
    await this.connect();
    let opened = false;
    try {
      await qz.serial.openPort(port, {
        baudRate: configuration.webSerialBaudRate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'NONE',
        // La 2C-P58-C no expone CTS sobre su puerto Bluetooth virtual. Con
        // RTS/CTS QZ acepta el trabajo, pero el sistema nunca transmite bytes.
        flowControl: 'NONE',
      });
      opened = true;
      await qz.serial.sendData(port, { type: 'BASE64', data: this.toBase64(bytes) });
      await this.delay(2000);
    } finally {
      if (opened) {
        try {
          await qz.serial.closePort(port);
        } catch {
          // El siguiente trabajo intentará abrir el puerto nuevamente.
        }
      }
    }
  }

  private async writePrinterQueue(bytes: Uint8Array, configuration: PrinterConfiguration): Promise<void> {
    const printer = configuration.qzPrinterName;
    if (!printer) throw new Error('QZ_PRINTER_NOT_SELECTED');

    await this.connect();
    const printConfig = qz.configs.create(printer, {
      forceRaw: true,
      jobName: 'Cuadrato POS - ESC/POS',
    });
    await qz.print(printConfig, [{
      type: 'raw',
      format: 'command',
      flavor: 'base64',
      data: this.toBase64(bytes),
    }]);
  }

  private async connect(): Promise<void> {
    if (qz.websocket.isActive()) return;
    await qz.websocket.connect({ retries: 2, delay: 1 });
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return window.btoa(binary);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
