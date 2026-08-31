import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  bytesToBase64,
  DiscoveredNetworkPrinter,
  PrinterDevice,
  PrintTarget,
  ThermalPrinter,
} from '@devlas/capacitor-thermal-printer';
import { CompanyProfileService } from '../../../core/services/company-profile.service';
import { Factura } from '../models/factura.model';
import { PrinterConfiguration } from '../models/printer-configuration.model';

@Injectable({ providedIn: 'root' })
export class ThermalPrinterService {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  get platform(): string {
    return Capacitor.getPlatform();
  }

  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  async listDevices(transport: 'bluetooth' | 'usb'): Promise<PrinterDevice[]> {
    this.ensureNativeTransport(transport);
    try {
      return (await ThermalPrinter.list({ transport })).devices || [];
    } catch (error) {
      if (this.getErrorCode(error) === 'permission_denied') {
        await ThermalPrinter.requestPermission(transport === 'bluetooth'
          ? { transport, address: '' }
          : { transport });
        return (await ThermalPrinter.list({ transport })).devices || [];
      }
      throw error;
    }
  }

  async discoverNetworkPrinters(): Promise<DiscoveredNetworkPrinter[]> {
    this.ensureNativeTransport('tcp');
    return (await ThermalPrinter.discover({ transport: 'tcp', timeoutMs: 5000 })).devices || [];
  }

  async printTest(configuration: PrinterConfiguration): Promise<void> {
    this.validateThermalConfiguration(configuration);
    await this.send(configuration, this.buildTestBytes(configuration));
  }

  buildTestBytes(configuration: PrinterConfiguration): Uint8Array {
    const width = configuration.format === 'ticket80' ? 48 : 32;
    const lines = [
      this.center('PRUEBA DE IMPRESION', width),
      this.rule(width),
      this.center(configuration.printerName || 'Impresora configurada', width),
      `Conexion: ${configuration.transport.toUpperCase()}`,
      `Papel: ${configuration.format === 'ticket80' ? '80 mm' : '58 mm'}`,
      this.rule(width),
      this.center('Cuadrato POS', width),
      '', '', '',
    ];
    return this.encodeDocument(lines, configuration.cutPaper);
  }

  async printInvoice(factura: Factura, configuration: PrinterConfiguration): Promise<void> {
    this.validateThermalConfiguration(configuration);
    const bytes = await this.buildInvoiceBytes(factura, configuration);
    for (let copy = 0; copy < configuration.copies; copy += 1) {
      await this.send(configuration, bytes);
    }
  }

  async buildInvoiceBytes(factura: Factura, configuration: PrinterConfiguration): Promise<Uint8Array> {
    let branding = this.companyProfileService.normalizeProfile();
    try {
      branding = (await this.companyProfileService.getBrandingSnapshot()).profile;
    } catch (error) {
      console.warn('[ThermalPrinter] Se usará el branding local predeterminado:', error);
    }
    const width = configuration.format === 'ticket80' ? 48 : 32;
    const lines: string[] = [];

    lines.push(this.center(branding.companyTitle, width));
    if (branding.ticketSubtitle) lines.push(this.center(branding.ticketSubtitle, width));
    if (branding.rnc) lines.push(this.center(`RNC: ${branding.rnc}`, width));
    if (branding.telefono) lines.push(this.center(`Tel: ${branding.telefono}`, width));
    if (branding.direccion) lines.push(...this.wrap(branding.direccion, width).map((line) => this.center(line, width)));
    lines.push(this.rule(width));
    lines.push(`Factura: ${factura.numero || factura.numeroFactura || '—'}`);
    lines.push(`NCF: ${factura.ncf || '—'}`);
    lines.push(`Fecha: ${this.formatDate(factura.fecha)}`);
    lines.push(...this.wrap(`Cliente: ${factura.clienteNombre || 'Consumidor final'}`, width));
    if (factura.clienteRncCedula) lines.push(`RNC/Cedula: ${factura.clienteRncCedula}`);
    lines.push(this.rule(width));

    for (const item of factura.items || []) {
      lines.push(...this.wrap(item.descripcion || 'Producto', width));
      const detailLeft = `${this.number(item.cantidad)} x ${this.money(item.precioUnitario)}`;
      lines.push(this.columns(detailLeft, this.money(item.total), width));
    }

    lines.push(this.rule(width));
    lines.push(this.columns('Subtotal', this.money(factura.subtotal), width));
    lines.push(this.columns('Descuento', this.money(factura.descuentoTotal || 0), width));
    lines.push(this.columns('ITBIS', this.money(factura.itbisTotal ?? factura.impuesto), width));
    lines.push(this.columns('TOTAL', this.money(factura.total), width));
    lines.push(this.rule(width));
    lines.push(this.columns('Pagado', this.money(factura.montoPagado ?? factura.totalPagado ?? factura.total), width));
    lines.push(this.columns('Devuelta', this.money(factura.devuelta ?? factura.cambio ?? 0), width));
    lines.push(...this.wrap(`Forma de pago: ${(factura.formaPago || 'efectivo').toUpperCase()}`, width));
    lines.push('');
    lines.push(this.center('Gracias por su compra', width));
    lines.push('', '', '');

    return this.encodeDocument(lines, configuration.cutPaper);
  }

  validateThermalConfiguration(configuration: PrinterConfiguration): void {
    if (configuration.format === 'letter' || configuration.transport === 'system') {
      throw new Error('THERMAL_FORMAT_REQUIRED');
    }
    if (configuration.transport === 'bluetooth' && !configuration.bluetoothAddress) {
      throw new Error('PRINTER_NOT_CONFIGURED');
    }
    if (configuration.transport === 'tcp' && !configuration.networkHost) {
      throw new Error('PRINTER_NOT_CONFIGURED');
    }
    if (configuration.transport === 'usb' && configuration.usbVendorId === undefined) {
      throw new Error('PRINTER_NOT_CONFIGURED');
    }
    this.ensureNativeTransport(configuration.transport);
  }

  getFriendlyError(error: unknown): string {
    const code = this.getErrorCode(error);
    const message = String((error as Error)?.message || '');
    if (message === 'PRINTER_NOT_CONFIGURED') return 'Selecciona y guarda una impresora antes de imprimir.';
    if (message === 'NATIVE_PRINTING_REQUIRED') return 'La impresión directa requiere la aplicación instalada en Android o iOS.';
    if (message === 'UNSUPPORTED_IOS_TRANSPORT') return 'En iPhone/iPad esta conexión no está disponible; utiliza una impresora de red.';

    const messages: Record<string, string> = {
      unavailable: 'La conexión seleccionada no está disponible en este dispositivo.',
      not_found: 'No se encontró la impresora. Verifica que esté encendida y conectada.',
      permission_denied: 'No se concedió permiso para utilizar la impresora.',
      connect_failed: 'No fue posible conectar con la impresora.',
      write_failed: 'La conexión se interrumpió mientras se enviaba el ticket.',
      invalid_transport: 'El tipo de conexión configurado no es válido.',
      invalid_data: 'No fue posible preparar los datos del ticket.',
    };
    return messages[code] || 'No fue posible completar la impresión.';
  }

  private async send(configuration: PrinterConfiguration, bytes: Uint8Array): Promise<void> {
    const target = this.buildTarget(configuration);
    const permission = await ThermalPrinter.requestPermission(target);
    if (!permission.granted) throw Object.assign(new Error('Permiso denegado'), { code: 'permission_denied' });
    await ThermalPrinter.print({ ...target, data: bytesToBase64(bytes) });
  }

  private buildTarget(configuration: PrinterConfiguration): PrintTarget {
    if (configuration.transport === 'bluetooth') {
      return { transport: 'bluetooth', address: configuration.bluetoothAddress || '' };
    }
    if (configuration.transport === 'usb') {
      return {
        transport: 'usb',
        vendorId: configuration.usbVendorId,
        productId: configuration.usbProductId,
      };
    }
    if (configuration.transport === 'tcp') {
      return {
        transport: 'tcp',
        host: configuration.networkHost || '',
        port: configuration.networkPort || 9100,
      };
    }
    throw new Error('THERMAL_FORMAT_REQUIRED');
  }

  private encodeDocument(lines: string[], cutPaper: boolean): Uint8Array {
    const bytes: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x02]; // Inicializar + CP850.
    for (const line of lines) {
      bytes.push(...this.encodeCp850(line), 0x0a);
    }
    if (cutPaper) bytes.push(0x1d, 0x56, 0x01);
    return new Uint8Array(bytes);
  }

  private encodeCp850(value: string): number[] {
    const extended: Record<string, number> = {
      'ü': 129, 'é': 130, 'á': 160, 'í': 161, 'ó': 162, 'ú': 163,
      'ñ': 164, 'Ñ': 165, '¿': 168, '¡': 173, 'Á': 181, 'É': 144,
      'Í': 214, 'Ó': 224, 'Ú': 233, 'Ü': 154, '°': 248,
    };
    return Array.from(value.normalize('NFC')).map((character) => {
      if (extended[character] !== undefined) return extended[character];
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126 ? code : 63;
    });
  }

  private columns(left: string, right: string, width: number): string {
    const safeRight = right.slice(0, width);
    const availableLeft = Math.max(0, width - safeRight.length - 1);
    const safeLeft = left.slice(0, availableLeft);
    return `${safeLeft}${' '.repeat(Math.max(1, width - safeLeft.length - safeRight.length))}${safeRight}`;
  }

  private wrap(value: string, width: number): string[] {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (word.length > width) {
        if (line) lines.push(line);
        for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
        line = '';
      } else if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private center(value: string, width: number): string {
    const normalized = String(value || '').slice(0, width);
    return `${' '.repeat(Math.max(0, Math.floor((width - normalized.length) / 2)))}${normalized}`;
  }

  private rule(width: number): string {
    return '-'.repeat(width);
  }

  private money(value: unknown): string {
    return `RD$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private number(value: unknown): string {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  private ensureNativeTransport(transport: string): void {
    if (!this.isNative) throw new Error('NATIVE_PRINTING_REQUIRED');
    if (this.platform === 'ios' && transport !== 'tcp') throw new Error('UNSUPPORTED_IOS_TRANSPORT');
  }

  private getErrorCode(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const candidate = error as { code?: unknown };
    return String(candidate.code || '');
  }
}
