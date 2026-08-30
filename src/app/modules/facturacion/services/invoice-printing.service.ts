import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Factura } from '../models/factura.model';
import { PrinterConfiguration } from '../models/printer-configuration.model';
import { PdfFacturaService } from './pdf-factura.service';
import { PrinterConfigurationService } from './printer-configuration.service';
import { QzSerialPrinterService } from './qz-serial-printer.service';
import { ThermalPrinterService } from './thermal-printer.service';
import { WebSerialPrinterService } from './web-serial-printer.service';
import { WebUsbPrinterService } from './web-usb-printer.service';

@Injectable({ providedIn: 'root' })
export class InvoicePrintingService {
  constructor(
    private readonly configurationService: PrinterConfigurationService,
    private readonly thermalPrinterService: ThermalPrinterService,
    private readonly webSerialPrinterService: WebSerialPrinterService,
    private readonly webUsbPrinterService: WebUsbPrinterService,
    private readonly qzSerialPrinterService: QzSerialPrinterService,
    private readonly pdfFacturaService: PdfFacturaService,
  ) {}

  async print(factura: Factura, override?: PrinterConfiguration): Promise<void> {
    const configuration = override || await this.configurationService.load();
    if (!configuration.enabled) throw new Error('PRINTING_DISABLED');

    if (configuration.format === 'letter') {
      this.pdfFacturaService.imprimirFacturaCorporativa(factura);
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await this.thermalPrinterService.printInvoice(factura, configuration);
      return;
    }

    if (configuration.transport === 'webserial') {
      await this.webSerialPrinterService.printInvoice(factura, configuration);
      return;
    }

    if (configuration.transport === 'webusb') {
      await this.webUsbPrinterService.printInvoice(factura, configuration);
      return;
    }

    if (configuration.transport === 'qz' || configuration.transport === 'qz-printer') {
      await this.qzSerialPrinterService.printInvoice(factura, configuration);
      return;
    }

    if (configuration.transport === 'browser') {
      if (configuration.format === 'ticket58') this.pdfFacturaService.imprimirTicket58mm(factura);
      else this.pdfFacturaService.imprimirTicket80mm(factura);
      return;
    }

    throw new Error('WEB_PRINTER_NOT_CONFIGURED');
  }

  getFriendlyError(error: unknown): string {
    if (String((error as Error)?.message || '') === 'PRINTING_DISABLED') {
      return 'La impresión está desactivada en la configuración de esta caja.';
    }
    if (String((error as Error)?.message || '') === 'WEB_PRINTER_NOT_CONFIGURED') {
      return 'Configura una impresora compatible con la PWA antes de imprimir.';
    }
    if (!Capacitor.isNativePlatform()) {
      const transport = this.configurationService.getSnapshot().transport;
      if (transport === 'webusb') return this.webUsbPrinterService.getFriendlyError(error);
      return ['qz', 'qz-printer'].includes(transport)
        ? this.qzSerialPrinterService.getFriendlyError(error)
        : this.webSerialPrinterService.getFriendlyError(error);
    }
    return this.thermalPrinterService.getFriendlyError(error);
  }
}
