import { Injectable } from '@angular/core';
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { CompanyProfile } from '../../../core/models/company-profile.model';
import { CompanyProfileService } from '../../../core/services/company-profile.service';
import { Factura } from '../models/factura.model';
import { FacturaItem } from '../models/factura-item.model';
import { TurnoCaja, TurnoTotales } from '../models/turno-caja.model';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Injectable({ providedIn: 'root' })
export class PdfFacturaService {
  private configured = false;
  private branding: CompanyProfile;
  private logoDataUrl?: string;
  private logoLoadPromise?: Promise<void>;

  constructor(private readonly companyProfileService: CompanyProfileService) {
    this.branding = this.companyProfileService.normalizeProfile();
  }

  private configurarPdfMake(): void {
    if (this.configured) return;
    const fonts = pdfFonts as any;
    (pdfMake as any).vfs = fonts?.vfs || fonts?.pdfMake?.vfs;
    this.configured = true;
  }

  private ensureLogoLoaded(): Promise<void> {
    if (this.logoDataUrl) return Promise.resolve();
    if (this.logoLoadPromise) return this.logoLoadPromise;

    this.logoLoadPromise = this.companyProfileService.getBrandingSnapshot()
      .then(({ profile, logoDataUrl }) => {
        this.branding = profile;
        this.logoDataUrl = logoDataUrl;
      })
      .catch((error) => {
        console.warn('[PdfFactura] No se pudo cargar branding para factura:', error);
        this.branding = this.companyProfileService.normalizeProfile();
        this.logoDataUrl = undefined;
      })
      .finally(() => {
        this.logoLoadPromise = undefined;
      });

    return this.logoLoadPromise;
  }

  /**
   * Conversión segura para cualquier valor numérico usado en cálculos/render.
   */
  toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    return Number(String(value).replace(/[^\d.-]/g, '')) || 0;
  }

  /**
   * Formato de moneda único para ticket/factura.
   * Siempre: RD$ + separador de miles + 2 decimales.
   */
  formatDOP(value: unknown): string {
    const amount = new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
    return `RD$${amount}`;
  }

  /**
   * Formato de fecha para ticket:
   * dd/MM/yyyy, hh:mm a. m./p. m.
   */
  private formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const formatted = new Intl.DateTimeFormat('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return formatted.replace(/\s?AM/i, ' a. m.').replace(/\s?PM/i, ' p. m.');
  }

  getItemItbisPercent(item: FacturaItem): number {
    if (!this.itemHasVisibleItbis(item)) return 0;
    const percent = this.toNumber(item.porcentajeItbis);
    if (item.origen === 'cita') return percent > 0 ? percent : 0;
    return percent > 0 ? percent : 18;
  }

  getItemItbisAmount(item: FacturaItem): number {
    if (!this.itemHasVisibleItbis(item)) return 0;
    const explicit = this.toNumber(item.itbis);
    if (explicit > 0) return explicit;
    const subtotal = this.toNumber(item.subtotal);
    const percent = this.getItemItbisPercent(item);
    return Number((subtotal * (percent / 100)).toFixed(2));
  }

  getItemTotal(item: FacturaItem): number {
    const total = this.toNumber(item.total);
    if (total > 0) return total;
    const subtotal = this.toNumber(item.subtotal);
    return Number((subtotal + this.getItemItbisAmount(item)).toFixed(2));
  }

  private itemHasVisibleItbis(item: FacturaItem): boolean {
    if (item.aplicaItbis === false) return false;
    if (this.toNumber(item.itbis) > 0) return true;
    return this.toNumber(item.porcentajeItbis) > 0;
  }

  buildTicket80mmPdfDefinition(factura: Factura): TDocumentDefinitions {
    const subtotal = this.toNumber(factura.subtotal);
    const itbis = this.toNumber(factura.itbisTotal ?? factura.impuesto);
    const descuento = this.toNumber(factura.descuentoTotal);
    const total = this.toNumber(factura.total);
    const pagado = this.toNumber(factura.montoPagado ?? factura.totalPagado ?? total);
    const devuelta = this.toNumber(factura.devuelta ?? factura.cambio ?? 0);
    const moneyFontSize = 7;
    const tableBody: any[] = [
      [
        { text: 'ÍTEM', style: 'tableHeader' },
        { text: 'CANT.', style: 'tableHeader', alignment: 'center', noWrap: true },
        { text: 'PRECIO UNIT.', style: 'tableHeader', alignment: 'right', noWrap: true },
        { text: 'ITBIS', style: 'tableHeader', alignment: 'center', noWrap: true },
        { text: 'TOTAL', style: 'tableHeader', alignment: 'right', noWrap: true },
      ],
      ...(factura.items || []).map((item) => {
        const code = item.codigo ? `\nCódigo: ${item.codigo}` : '';
        const itbisAmount = this.getItemItbisAmount(item);
        const itbisLabel = this.itemHasVisibleItbis(item) ? this.formatDOP(itbisAmount) : '0.00';
        return [
          { text: `${item.descripcion || '—'}${code}`, style: 'itemNameCell' },
          { text: String(this.toNumber(item.cantidad)), fontSize: moneyFontSize, alignment: 'center', noWrap: true },
          { text: this.formatDOP(this.toNumber(item.precioUnitario)), fontSize: moneyFontSize, alignment: 'right', noWrap: true },
          { text: itbisLabel, fontSize: 6.4, alignment: 'center', noWrap: true },
          { text: this.formatDOP(this.getItemTotal(item)), fontSize: moneyFontSize, bold: true, alignment: 'right', noWrap: true },
        ];
      }),
    ];
    const logoBlock: any[] = this.logoDataUrl
      ? [{
          image: this.logoDataUrl,
          width: 52,
          alignment: 'center',
          margin: [0, 0, 0, 6] as [number, number, number, number],
        }]
      : [];

    return {
      pageSize: { width: 226.77, height: 'auto' }, // 80mm
      pageMargins: [9, 10, 9, 10],
      content: [
        ...logoBlock,
        { text: this.branding.companyTitle, style: 'companyTitle', alignment: 'center' },
        { text: this.branding.ticketSubtitle || 'TICKET DE FACTURA', style: 'ticketSubtitle', alignment: 'center' },
        { text: this.companyProfileService.buildContactLine(this.branding), style: 'metaCenter', alignment: 'center', margin: [0, 1, 0, 0] },
        { text: this.branding.direccion || 'Dirección', style: 'metaCenter', alignment: 'center', margin: [0, 0, 0, 4] },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 208, y2: 0, lineWidth: 0.7, lineColor: '#7c8aa355', dash: { length: 2, space: 2 } },
          ],
          margin: [0, 0, 0, 4],
        },
        { text: [{ text: 'Factura: ', bold: true }, { text: factura.numero || '—' }], style: 'infoLine' },
        { text: [{ text: 'NCF: ', bold: true }, { text: factura.ncf || '—' }], style: 'infoLine' },
        { text: [{ text: 'Fecha: ', bold: true }, { text: this.formatDate(factura.fecha) }], style: 'infoLine' },
        { text: [{ text: 'Cliente: ', bold: true }, { text: factura.clienteNombre || '—' }], style: 'infoLine' },
        { text: [{ text: 'RNC/Cédula: ', bold: true }, { text: factura.clienteRncCedula || '—' }], style: 'infoLine', margin: [0, 0, 0, 4] },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 208, y2: 0, lineWidth: 0.7, lineColor: '#7c8aa355', dash: { length: 2, space: 2 } },
          ],
          margin: [0, 0, 0, 4],
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 20, 46, 42, 48],
            body: tableBody,
          } as any,
          layout: {
            hLineWidth: (i: number) => (i === 1 ? 0 : 0.4),
            vLineWidth: () => 0,
            hLineColor: () => '#7c8aa34d',
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 2.5,
            paddingBottom: () => 2.5,
            fillColor: (rowIndex: number) => (rowIndex === 0 ? '#0f172a' : null),
          },
          margin: [0, 0, 0, 4],
        },
        { text: `Subtotal: ${this.formatDOP(subtotal)}`, style: 'summaryLine', alignment: 'right', noWrap: true },
        { text: `Descuento: ${this.formatDOP(descuento)}`, style: 'summaryLine', alignment: 'right', noWrap: true },
        { text: `ITBIS Total: ${this.formatDOP(itbis)}`, style: 'summaryLine', alignment: 'right', noWrap: true },
        {
          canvas: [{ type: 'line', x1: 88, y1: 0, x2: 208, y2: 0, lineWidth: 1.2, lineColor: '#111827' }],
          margin: [0, 2, 0, 3],
        },
        { text: `TOTAL: ${this.formatDOP(total)}`, style: 'summaryTotal', alignment: 'right', margin: [0, 0, 0, 4], noWrap: true },
        {
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { columns: [{ text: 'PAGADO', style: 'payLabel' }, { text: this.formatDOP(pagado), style: 'payValue', alignment: 'right', noWrap: true }], margin: [0, 0, 0, 2] },
                { columns: [{ text: 'DEVUELTA', style: 'payLabel' }, { text: this.formatDOP(devuelta), style: 'payValue', alignment: 'right', noWrap: true }], margin: [0, 0, 0, 2] },
                { columns: [{ text: 'FORMA DE PAGO', style: 'payLabel' }, { text: (factura.formaPago || 'efectivo').toUpperCase(), style: 'payValue', alignment: 'right', noWrap: true }] },
              ],
            }]],
          } as any,
          layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => '#7c8aa366',
            vLineColor: () => '#7c8aa366',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
          margin: [0, 2, 0, 5],
        },
        { text: '¡Gracias por su compra!', fontSize: 8, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
        // { text: 'Preparado para facturación electrónica (e-CF).', fontSize: 7, alignment: 'center' },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 208, y2: 0, lineWidth: 0.7, lineColor: '#7c8aa355', dash: { length: 2, space: 2 } },
          ],
          margin: [0, 5, 0, 4],
        },
        {
          columns: [
            { text: this.formatDate(factura.fecha), style: 'footerMeta' },
            { text: 'Sistema POS', style: 'footerMeta', alignment: 'center' },
            { text: factura.artistaNombre || 'Vendedor', style: 'footerMeta', alignment: 'right' },
          ],
        },
        { text: (factura as any).eCFUrl || (factura as any).codigoSeguridad || (factura as any).qrData ? 'QR disponible (e-CF).' : 'QR reservado para e-CF.', fontSize: 6, alignment: 'center', color: '#94a3b8' },
      ],
      defaultStyle: {
        fontSize: 8,
      },
      styles: {
        companyTitle: { fontSize: 11, bold: true, color: '#0f172a' },
        ticketSubtitle: { fontSize: 8, bold: true, color: '#334155' },
        metaCenter: { fontSize: 6.6, color: '#64748b' },
        infoLine: { fontSize: 7.2, color: '#111827' },
        tableHeader: { fontSize: 6.4, bold: true, color: '#ffffff' },
        itemNameCell: { fontSize: 6.7, color: '#0f172a' },
        summaryLine: { fontSize: 7.2, color: '#1f2937' },
        summaryTotal: { fontSize: 11, bold: true, color: '#111827' },
        payLabel: { fontSize: 6.8, bold: true, color: '#334155' },
        payValue: { fontSize: 7.2, bold: true, color: '#111827' },
        footerMeta: { fontSize: 6.1, color: '#64748b' },
      },
    };
  }

  buildTicket58mmPdfDefinition(factura: Factura): TDocumentDefinitions {
    const subtotal = this.toNumber(factura.subtotal);
    const descuento = this.toNumber(factura.descuentoTotal);
    const itbis = this.toNumber(factura.itbisTotal ?? factura.impuesto);
    const total = this.toNumber(factura.total);
    const items = (factura.items || []).flatMap((item) => [
      { text: item.descripcion || '—', bold: true, fontSize: 7, margin: [0, 2, 0, 0] },
      {
        columns: [
          { text: `${this.toNumber(item.cantidad)} x ${this.formatDOP(item.precioUnitario)}`, fontSize: 6.5 },
          { text: this.formatDOP(this.getItemTotal(item)), fontSize: 6.5, bold: true, alignment: 'right' },
        ],
      },
    ]);
    const logoBlock: any[] = this.logoDataUrl
      ? [{ image: this.logoDataUrl, width: 42, alignment: 'center', margin: [0, 0, 0, 4] }]
      : [];

    return {
      pageSize: { width: 164.41, height: 'auto' }, // 58 mm
      pageMargins: [8, 9, 8, 9],
      content: [
        ...logoBlock,
        { text: this.branding.companyTitle, fontSize: 10, bold: true, alignment: 'center' },
        { text: this.branding.ticketSubtitle || 'TICKET DE FACTURA', fontSize: 7, bold: true, alignment: 'center' },
        { text: this.companyProfileService.buildContactLine(this.branding), fontSize: 5.8, alignment: 'center' },
        { text: this.branding.direccion || '', fontSize: 5.8, alignment: 'center', margin: [0, 0, 0, 4] },
        { text: '-'.repeat(38), fontSize: 6, alignment: 'center' },
        { text: `Factura: ${factura.numero || '—'}`, fontSize: 6.5 },
        { text: `NCF: ${factura.ncf || '—'}`, fontSize: 6.5 },
        { text: `Fecha: ${this.formatDate(factura.fecha)}`, fontSize: 6.5 },
        { text: `Cliente: ${factura.clienteNombre || 'Consumidor final'}`, fontSize: 6.5 },
        { text: '-'.repeat(38), fontSize: 6, alignment: 'center' },
        ...items,
        { text: '-'.repeat(38), fontSize: 6, alignment: 'center', margin: [0, 2, 0, 1] },
        { columns: [{ text: 'Subtotal', fontSize: 6.5 }, { text: this.formatDOP(subtotal), fontSize: 6.5, alignment: 'right' }] },
        { columns: [{ text: 'Descuento', fontSize: 6.5 }, { text: this.formatDOP(descuento), fontSize: 6.5, alignment: 'right' }] },
        { columns: [{ text: 'ITBIS', fontSize: 6.5 }, { text: this.formatDOP(itbis), fontSize: 6.5, alignment: 'right' }] },
        { columns: [{ text: 'TOTAL', fontSize: 9, bold: true }, { text: this.formatDOP(total), fontSize: 9, bold: true, alignment: 'right' }], margin: [0, 2, 0, 3] },
        { text: `Pago: ${(factura.formaPago || 'efectivo').toUpperCase()}`, fontSize: 6.5 },
        { text: '¡Gracias por su compra!', fontSize: 7, bold: true, alignment: 'center', margin: [0, 6, 0, 4] },
      ],
      defaultStyle: { fontSize: 7 },
    };
  }

  buildFacturaCorporativaPdfDefinition(factura: Factura): TDocumentDefinitions {
    const subtotal = this.toNumber(factura.subtotal);
    const itbis = this.toNumber(factura.itbisTotal ?? factura.impuesto);
    const descuento = this.toNumber(factura.descuentoTotal);
    const total = this.toNumber(factura.total);
    const tableBody: any[] = [
      [
        { text: 'Descripción', style: 'corporateTableHeader' },
        { text: 'Cant.', style: 'corporateTableHeader', alignment: 'center' },
        { text: 'Precio', style: 'corporateTableHeader', alignment: 'right' },
        { text: 'ITBIS', style: 'corporateTableHeader', alignment: 'right' },
        { text: 'Total', style: 'corporateTableHeader', alignment: 'right' },
      ],
      ...(factura.items || []).map((item) => [
        { text: item.descripcion || '—' },
        { text: String(this.toNumber(item.cantidad)), alignment: 'center' },
        { text: this.formatDOP(item.precioUnitario), alignment: 'right', noWrap: true },
        { text: this.formatDOP(this.getItemItbisAmount(item)), alignment: 'right', noWrap: true },
        { text: this.formatDOP(this.getItemTotal(item)), alignment: 'right', bold: true, noWrap: true },
      ]),
    ];
    const logoBlock: any[] = this.logoDataUrl ? [{ image: this.logoDataUrl, width: 82 }] : [];

    return {
      pageSize: 'LETTER',
      pageOrientation: 'portrait',
      pageMargins: [38, 42, 38, 44],
      content: [
        {
          columns: [
            { stack: logoBlock, width: 95 },
            {
              stack: [
                { text: this.branding.companyTitle, style: 'corporateCompany' },
                { text: this.branding.direccion || '', style: 'corporateMeta' },
                { text: this.companyProfileService.buildContactLine(this.branding), style: 'corporateMeta' },
              ],
              alignment: 'right',
            },
          ],
          margin: [0, 0, 0, 22],
        },
        {
          columns: [
            {
              stack: [
                { text: 'FACTURAR A', style: 'corporateLabel' },
                { text: factura.clienteNombre || 'Consumidor final', bold: true, margin: [0, 3, 0, 2] },
                { text: factura.clienteRncCedula ? `RNC/Cédula: ${factura.clienteRncCedula}` : '', style: 'corporateMeta' },
                { text: factura.clienteTelefono || '', style: 'corporateMeta' },
              ],
            },
            {
              width: 210,
              table: {
                widths: [75, '*'],
                body: [
                  [{ text: 'FACTURA', style: 'corporateLabel' }, { text: factura.numero || factura.numeroFactura || '—', bold: true }],
                  [{ text: 'NCF', style: 'corporateLabel' }, factura.ncf || '—'],
                  [{ text: 'FECHA', style: 'corporateLabel' }, this.formatDate(factura.fecha)],
                  [{ text: 'PAGO', style: 'corporateLabel' }, (factura.formaPago || 'efectivo').toUpperCase()],
                ],
              },
              layout: 'noBorders',
            },
          ],
          margin: [0, 0, 0, 22],
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 40, 68, 62, 72],
            body: tableBody,
          },
          layout: {
            hLineWidth: (index: number) => index === 0 ? 0 : .5,
            vLineWidth: () => 0,
            hLineColor: () => '#d7dee8',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 7,
            paddingBottom: () => 7,
            fillColor: (rowIndex: number) => rowIndex === 0 ? '#0f172a' : null,
          },
          margin: [0, 0, 0, 16],
        },
        {
          columns: [
            {
              stack: [
                { text: 'Gracias por su compra.', bold: true, color: '#334155' },
                { text: 'Documento generado por Cuadrato POS.', style: 'corporateMeta', margin: [0, 4, 0, 0] },
              ],
            },
            {
              width: 220,
              table: {
                widths: ['*', 88],
                body: [
                  ['Subtotal', { text: this.formatDOP(subtotal), alignment: 'right' }],
                  ['Descuento', { text: this.formatDOP(descuento), alignment: 'right' }],
                  ['ITBIS', { text: this.formatDOP(itbis), alignment: 'right' }],
                  [{ text: 'TOTAL', bold: true, fontSize: 12 }, { text: this.formatDOP(total), bold: true, fontSize: 12, alignment: 'right' }],
                ],
              },
              layout: 'lightHorizontalLines',
            },
          ],
        },
      ],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: factura.numero || '', alignment: 'left' },
          { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right' },
        ],
        margin: [38, 10, 38, 0],
        fontSize: 8,
        color: '#64748b',
      }),
      defaultStyle: { fontSize: 9, color: '#1f2937' },
      styles: {
        corporateCompany: { fontSize: 18, bold: true, color: '#0f172a' },
        corporateMeta: { fontSize: 8, color: '#64748b' },
        corporateLabel: { fontSize: 8, bold: true, color: '#64748b' },
        corporateTableHeader: { fontSize: 8, bold: true, color: '#ffffff' },
      },
    };
  }

  buildFacturaPdfDefinition(factura: Factura): TDocumentDefinitions {
    return this.buildFacturaCorporativaPdfDefinition(factura);
  }

  generarFacturaPdf(factura: Factura): void {
    this.descargarFacturaPdf(factura);
  }

  imprimirTicket80mm(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      const docDefinition = this.buildTicket80mmPdfDefinition(factura);
      pdfMake.createPdf(docDefinition).print();
    });
  }

  imprimirTicket58mm(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      pdfMake.createPdf(this.buildTicket58mmPdfDefinition(factura)).print();
    });
  }

  imprimirFacturaPdf(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      const docDefinition = this.buildFacturaPdfDefinition(factura);
      pdfMake.createPdf(docDefinition).print();
    });
  }

  imprimirFacturaCorporativa(factura: Factura): void {
    this.imprimirFacturaPdf(factura);
  }

  abrirPreview(factura: Factura): void {
    this.abrirFacturaPdf(factura);
  }

  abrirFacturaPdf(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      pdfMake.createPdf(this.buildFacturaPdfDefinition(factura)).open();
    });
  }

  descargarFacturaPdf(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      const docDefinition = this.buildFacturaPdfDefinition(factura);
      const fileName = `${factura.numero || factura.id || 'factura'}.pdf`;
      pdfMake.createPdf(docDefinition).download(fileName);
    });
  }

  abrirTicket80mm(factura: Factura): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      pdfMake.createPdf(this.buildTicket80mmPdfDefinition(factura)).open();
    });
  }

  buildCierreTurnoPdfDefinition(turno: TurnoCaja, totales: TurnoTotales, efectivoContado: number, observacionCierre = ''): TDocumentDefinitions {
    const montoInicial = this.toNumber(turno.montoInicial);
    const totalEfectivo = this.toNumber(totales.totalEfectivo);
    const efectivoEsperado = Number((montoInicial + totalEfectivo).toFixed(2));
    const contado = this.toNumber(efectivoContado);
    const diferencia = Number((contado - efectivoEsperado).toFixed(2));
    const apertura = this.formatDate(this.toDateLike(turno.fechaApertura));
    const cierre = this.formatDate(new Date().toISOString());
    const logoBlock: any[] = this.logoDataUrl
      ? [{
          image: this.logoDataUrl,
          width: 46,
          alignment: 'center' as const,
          margin: [0, 0, 0, 6] as [number, number, number, number],
        }]
      : [];

    return {
      pageSize: { width: 226.77, height: 'auto' },
      pageMargins: [9, 10, 9, 10],
      content: [
        ...logoBlock,
        { text: this.branding.companyTitle, style: 'companyTitle', alignment: 'center' },
        { text: 'CIERRE DE TURNO', style: 'ticketSubtitle', alignment: 'center', margin: [0, 0, 0, 4] },
        { text: this.companyProfileService.buildContactLine(this.branding), style: 'metaCenter', alignment: 'center', margin: [0, 0, 0, 4] },
        { text: [{ text: 'Turno: ', bold: true }, turno.numeroTurno || '—'], style: 'infoLine' },
        { text: [{ text: 'Caja: ', bold: true }, `${turno.cajaNombre || '—'} (${turno.cajaId || '—'})`], style: 'infoLine' },
        { text: [{ text: 'Usuario: ', bold: true }, turno.usuarioNombre || '—'], style: 'infoLine' },
        { text: [{ text: 'Apertura: ', bold: true }, apertura], style: 'infoLine' },
        { text: [{ text: 'Cierre: ', bold: true }, cierre], style: 'infoLine', margin: [0, 0, 0, 4] },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'Cantidad facturas', style: 'payLabel' }, { text: String(this.toNumber(totales.cantidadFacturas)), style: 'payValue', alignment: 'right' }],
              [{ text: 'Ventas del turno', style: 'payLabel' }, { text: this.formatDOP(totales.totalVentas), style: 'payValue', alignment: 'right' }],
              [{ text: 'Total efectivo', style: 'payLabel' }, { text: this.formatDOP(totales.totalEfectivo), style: 'payValue', alignment: 'right' }],
              [{ text: 'Total tarjeta', style: 'payLabel' }, { text: this.formatDOP(totales.totalTarjeta), style: 'payValue', alignment: 'right' }],
              [{ text: 'Total transferencia', style: 'payLabel' }, { text: this.formatDOP(totales.totalTransferencia), style: 'payValue', alignment: 'right' }],
              [{ text: 'Total credito', style: 'payLabel' }, { text: this.formatDOP(totales.totalCredito), style: 'payValue', alignment: 'right' }],
              [{ text: 'Monto inicial', style: 'payLabel' }, { text: this.formatDOP(montoInicial), style: 'payValue', alignment: 'right' }],
              [{ text: 'Efectivo esperado', style: 'payLabel' }, { text: this.formatDOP(efectivoEsperado), style: 'payValue', alignment: 'right' }],
              [{ text: 'Efectivo contado', style: 'payLabel' }, { text: this.formatDOP(contado), style: 'payValue', alignment: 'right' }],
              [{ text: 'Diferencia', style: 'payLabel' }, { text: this.formatDOP(diferencia), style: 'payValue', alignment: 'right' }],
            ],
          } as any,
          layout: 'lightHorizontalLines',
          margin: [0, 2, 0, 4],
        },
        { text: [{ text: 'Observación: ', bold: true }, observacionCierre || '—'], style: 'metaCenter', alignment: 'left' },
      ],
      defaultStyle: { fontSize: 8 },
      styles: {
        companyTitle: { fontSize: 11, bold: true, color: '#0f172a' },
        ticketSubtitle: { fontSize: 8, bold: true, color: '#334155' },
        metaCenter: { fontSize: 6.8, color: '#64748b' },
        infoLine: { fontSize: 7.2, color: '#111827' },
        payLabel: { fontSize: 6.8, bold: true, color: '#334155' },
        payValue: { fontSize: 7.2, bold: true, color: '#111827' },
      },
    };
  }

  imprimirCierreTurno(turno: TurnoCaja, totales: TurnoTotales, efectivoContado: number, observacionCierre = ''): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      pdfMake.createPdf(this.buildCierreTurnoPdfDefinition(turno, totales, efectivoContado, observacionCierre)).print();
    });
  }

  abrirCierreTurno(turno: TurnoCaja, totales: TurnoTotales, efectivoContado: number, observacionCierre = ''): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      pdfMake.createPdf(this.buildCierreTurnoPdfDefinition(turno, totales, efectivoContado, observacionCierre)).open();
    });
  }

  descargarCierreTurno(turno: TurnoCaja, totales: TurnoTotales, efectivoContado: number, observacionCierre = ''): void {
    this.configurarPdfMake();
    void this.ensureLogoLoaded().finally(() => {
      const fileName = `cierre-${turno.numeroTurno || turno.id || 'turno'}.pdf`;
      pdfMake.createPdf(this.buildCierreTurnoPdfDefinition(turno, totales, efectivoContado, observacionCierre)).download(fileName);
    });
  }

  private toDateLike(value: any): string {
    if (!value) return new Date().toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    return new Date().toISOString();
  }
}
