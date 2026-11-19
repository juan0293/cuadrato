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
import { TurnoCaja } from '../models/turno-caja.model';

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
    let logoDataUrl: string | undefined;
    try {
      const snapshot = await this.companyProfileService.getBrandingSnapshot();
      branding = snapshot.profile;
      logoDataUrl = snapshot.logoDataUrl;
    } catch (error) {
      console.warn('[ThermalPrinter] Se usará el branding local predeterminado:', error);
    }
    const width = configuration.format === 'ticket80' ? 48 : 32;
    const lines: string[] = [];

    lines.push(this.center(branding.companyTitle, width));
    if (branding.ticketSubtitle && factura.tipoDocumento !== 'precuenta') lines.push(this.center(branding.ticketSubtitle, width));
    if (branding.rnc) lines.push(this.center(`RNC: ${branding.rnc}`, width));
    if (branding.telefono) lines.push(this.center(`Tel: ${branding.telefono}`, width));
    if (branding.direccion) lines.push(...this.wrap(branding.direccion, width).map((line) => this.center(line, width)));
    lines.push(this.rule(width));
    if (factura.tipoDocumento === 'precuenta') {
      lines.push(...this.wrap('PRECUENTA — NO VÁLIDA COMO FACTURA', width));
      lines.push(...this.wrap(`Cuenta: ${factura.cuentaAbiertaId || factura.numero}`, width));
    } else {
      lines.push(`Factura: ${factura.numero || factura.numeroFactura || '—'}`);
      lines.push(`NCF: ${factura.ncf || '—'}`);
    }
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
    if (factura.tipoDocumento !== 'precuenta') {
      lines.push(this.columns('Pagado', this.money(factura.montoPagado ?? factura.totalPagado ?? factura.total), width));
      lines.push(this.columns('Devuelta', this.money(factura.devuelta ?? factura.cambio ?? 0), width));
      lines.push(...this.wrap(`Forma de pago: ${(factura.formaPago || 'efectivo').toUpperCase()}`, width));
    } else lines.push(...this.wrap('Cuenta abierta. Pendiente de facturación.', width));
    lines.push('');
    lines.push(this.center('Gracias por su compra', width));
    lines.push('', '', '');

    let logoBytes: number[] = [];
    if (logoDataUrl) {
      try {
        logoBytes = await this.buildEscPosLogo(logoDataUrl, configuration.format === 'ticket80' ? 576 : 384);
      } catch (error) {
        // Una imagen inválida no debe impedir que la factura sea impresa.
        console.warn('[ThermalPrinter] No fue posible rasterizar el logo:', error);
      }
    }

    return this.encodeDocument(lines, configuration.cutPaper, logoBytes);
  }

  async printBytes(bytes: Uint8Array, configuration: PrinterConfiguration): Promise<void> {
    this.validateThermalConfiguration(configuration);
    for (let copy = 0; copy < configuration.copies; copy += 1) await this.send(configuration, bytes);
  }

  async buildShiftCloseBytes(turno: TurnoCaja, configuration: PrinterConfiguration): Promise<Uint8Array> {
    const width = configuration.format === 'ticket80' ? 48 : 32;
    let branding = this.companyProfileService.normalizeProfile();
    let logoBytes: number[] = [];
    try {
      const snapshot = await this.companyProfileService.getBrandingSnapshot();
      branding = snapshot.profile;
      if (snapshot.logoDataUrl) logoBytes = await this.buildEscPosLogo(snapshot.logoDataUrl, width === 48 ? 576 : 384);
    } catch (error) {
      console.warn('[ThermalPrinter] No se pudo cargar el logo del cuadre:', error);
    }
    const date = (value: any): string => {
      const resolved = typeof value?.toDate === 'function' ? value.toDate() : value;
      return resolved ? this.formatDate(new Date(resolved).toISOString()) : '—';
    };
    const lines = [
      ...this.wrap(branding.companyTitle, width).map((line) => this.center(line, width)),
      this.center('CIERRE DE TURNO', width),
      ...(branding.rnc ? this.wrap(`RNC: ${branding.rnc}`, width) : []),
      ...(branding.telefono ? this.wrap(`Tel: ${branding.telefono}`, width) : []),
      ...(branding.direccion ? this.wrap(branding.direccion, width) : []),
      this.rule(width),
      ...this.wrap(`Turno: ${turno.numeroTurno}`, width),
      ...this.wrap(`Caja: ${turno.cajaNombre}`, width),
      ...this.wrap(`Usuario: ${turno.usuarioNombre}`, width),
      ...this.wrap(`Apertura: ${date(turno.fechaApertura)}`, width),
      ...this.wrap(`Cierre: ${date(turno.fechaCierre)}`, width),
      this.rule(width),
    ];
    const rows: Array<[string, number]> = [
      ['Ventas del turno', turno.totalVentas], ['Total efectivo', turno.totalEfectivo],
      ['Total tarjeta', turno.totalTarjeta], ['Transferencia', turno.totalTransferencia],
      ['Total credito', turno.totalCredito], [turno.fondoInicialIncluidoEnConteo === false ? 'Fondo inicial aparte' : 'Fondo inicial incluido', turno.montoInicial],
      ['Efectivo esperado', turno.efectivoEsperado], ['Efectivo contado', turno.efectivoContado ?? 0],
      ['Diferencia efectivo', turno.diferencia ?? 0],
    ];
    lines.push(this.columns('Facturas', String(turno.cantidadFacturas), width));
    for (const [label, amount] of rows) {
      const money = this.money(amount);
      if (label.length + money.length + 1 > width) lines.push(label, this.columns('', money, width));
      else lines.push(this.columns(label, money, width));
    }
    if (turno.desgloseEfectivo?.length) {
      lines.push(this.rule(width), this.center('DESGLOSE DE EFECTIVO', width));
      for (const item of turno.desgloseEfectivo) {
        lines.push(...this.wrap(`RD$${item.denominacion} x ${item.cantidad}`, width));
        lines.push(this.columns('Subtotal', this.money(item.denominacion * item.cantidad), width));
      }
    }
    lines.push(this.rule(width), ...this.wrap(`Observacion: ${turno.observacionCierre || '—'}`, width), '', '', '');
    return this.encodeDocument(lines, configuration.cutPaper, logoBytes);
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

  private encodeDocument(lines: string[], cutPaper: boolean, headerBytes: number[] = []): Uint8Array {
    const bytes: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x02]; // Inicializar + CP850.
    bytes.push(...headerBytes);
    for (const line of lines) {
      bytes.push(...this.encodeCp850(line), 0x0a);
    }
    // GS V B: avanza hasta la posición de corte antes de accionar la cuchilla.
    if (cutPaper) bytes.push(0x1d, 0x56, 0x42, 0x00);
    return new Uint8Array(bytes);
  }

  /**
   * Convierte el logo a raster ESC/POS GS v 0 para papel de 58 u 80 mm.
   * Usa un lienzo de 384 o 576 puntos para mantenerlo centrado sin
   * depender de comandos de margen que varían entre impresoras económicas.
   */
  private async buildEscPosLogo(dataUrl: string, printerWidth: number): Promise<number[]> {
    const image = await this.loadImage(dataUrl);
    const maxLogoWidth = printerWidth === 576 ? 420 : 280;
    const maxLogoHeight = printerWidth === 576 ? 240 : 160;
    const scale = Math.min(maxLogoWidth / image.naturalWidth, maxLogoHeight / image.naturalHeight);
    const logoWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const logoHeight = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = printerWidth;
    canvas.height = logoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('LOGO_CANVAS_NOT_AVAILABLE');

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, Math.floor((printerWidth - logoWidth) / 2), 0, logoWidth, logoHeight);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const grayscale = new Float32Array(printerWidth * logoHeight);
    for (let index = 0; index < grayscale.length; index += 1) {
      const pixel = index * 4;
      const alpha = pixels[pixel + 3] / 255;
      const luminance = (pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114);
      grayscale[index] = (luminance * alpha) + (255 * (1 - alpha));
    }

    const widthBytes = printerWidth / 8;
    const raster = new Array<number>(widthBytes * logoHeight).fill(0);
    for (let y = 0; y < logoHeight; y += 1) {
      for (let x = 0; x < printerWidth; x += 1) {
        const index = (y * printerWidth) + x;
        const oldPixel = grayscale[index];
        const newPixel = oldPixel < 170 ? 0 : 255;
        const error = oldPixel - newPixel;
        if (newPixel === 0) raster[(y * widthBytes) + Math.floor(x / 8)] |= 0x80 >> (x % 8);

        // Tramado Floyd–Steinberg para conservar bordes y tonos en logos de color.
        if (x + 1 < printerWidth) grayscale[index + 1] += error * 7 / 16;
        if (y + 1 < logoHeight) {
          if (x > 0) grayscale[index + printerWidth - 1] += error * 3 / 16;
          grayscale[index + printerWidth] += error * 5 / 16;
          if (x + 1 < printerWidth) grayscale[index + printerWidth + 1] += error / 16;
        }
      }
    }

    return [
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      logoHeight & 0xff, (logoHeight >> 8) & 0xff,
      ...raster,
      0x0a,
    ];
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
        else reject(new Error('LOGO_HAS_INVALID_DIMENSIONS'));
      };
      image.onerror = () => reject(new Error('LOGO_LOAD_ERROR'));
      image.src = dataUrl;
    });
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
