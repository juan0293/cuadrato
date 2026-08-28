import { Injectable } from '@angular/core';
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { CompanyProfile } from '../../../core/models/company-profile.model';
import { CompanyProfileService } from '../../../core/services/company-profile.service';
import { Compra } from '../models/compra.model';
import { formatDopCurrency } from '../utils/currency-format.utils';

@Injectable({ providedIn: 'root' })
export class PdfCompraService {
  private branding: CompanyProfile;
  private logoDataUrl?: string;
  private brandingPromise?: Promise<void>;

  constructor(private readonly companyProfileService: CompanyProfileService) {
    this.branding = this.companyProfileService.normalizeProfile();
  }

  /**
   * Inicializa vfs de pdfMake en tiempo de uso para no romper lazy loading.
   */
  private configurarPdfMake(): void {
    const fonts = pdfFonts as any;
    (pdfMake as any).vfs = fonts?.vfs || fonts?.pdfMake?.vfs;
  }

  private ensureBrandingLoaded(): Promise<void> {
    if (this.brandingPromise) return this.brandingPromise;

    this.brandingPromise = this.companyProfileService.getBrandingSnapshot()
      .then(({ profile, logoDataUrl }) => {
        this.branding = profile;
        this.logoDataUrl = logoDataUrl;
      })
      .catch((error) => {
        console.warn('[PdfCompra] No se pudo cargar branding:', error);
        this.branding = this.companyProfileService.normalizeProfile();
        this.logoDataUrl = undefined;
      })
      .finally(() => {
        this.brandingPromise = undefined;
      });

    return this.brandingPromise;
  }

  private buildFileName(compra: Compra): string {
    const fallback = compra.id || new Date().getTime();
    const key = compra.numeroFactura || compra.ncf || String(fallback);
    return `compra-${key}.pdf`;
  }

  private safeText(value: unknown): string {
    const str = String(value ?? '').trim();
    return str && str !== 'undefined' && str !== 'null' ? str : '—';
  }

  private safeMoney(value: unknown): string {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? formatDopCurrency(num) : formatDopCurrency(0);
  }

  private formatPdfDate(value: any, includeTime = false): string {
    if (!value) return '—';

    let date: Date;

    if (value?.toDate) {
      date = value.toDate();
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return '—';

    const options: Intl.DateTimeFormatOptions = includeTime
      ? {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }
      : {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        };

    return new Intl.DateTimeFormat('es-DO', options).format(date);
  }

  generarDocDefinitionCompra(compra: Compra): TDocumentDefinitions {
    const now = new Date();

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [32, 36, 32, 40],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9,
        color: '#4B5563',
      },
      footer: (currentPage, pageCount) => ({
        margin: [32, 8, 32, 16],
        columns: [
          {
            text: `Documento generado desde ${this.branding.companyTitle} · Control interno de compras e inventario`,
            style: 'footerText',
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'right',
            style: 'footerText',
          },
        ],
      }),
      content: [
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [
                [
                  ...(this.logoDataUrl ? [{
                    image: this.logoDataUrl,
                    width: 54,
                    margin: [0, 0, 0, 6] as [number, number, number, number],
                  }] : []),
                  { text: this.branding.companyTitle, style: 'brand' },
                  { text: this.companyProfileService.buildContactLine(this.branding), style: 'metaMuted' },
                  { text: this.safeText(this.branding.direccion), style: 'metaMuted', margin: [0, 2, 0, 0] },
                  { text: 'Factura de compra', style: 'title' },
                ],
                {
                  table: {
                    body: [[{ text: this.safeText(compra.estado).toUpperCase(), style: 'statusChip' }]],
                  },
                  layout: 'noBorders',
                },
              ],
            ],
          },
          layout: 'noBorders',
        },
        {
          margin: [0, 10, 0, 12],
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 760, y2: 0, lineWidth: 1, lineColor: '#E5E7EB' }],
        },

        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'Datos de proveedor', style: 'sectionTitle' },
                { text: `Proveedor: ${this.safeText(compra.proveedorNombre)}`, style: 'metaText' },
                { text: `RNC: ${this.safeText(compra.proveedorRnc)}`, style: 'metaText' },
              ],
            },
            {
              width: '50%',
              stack: [
                { text: 'Datos de factura', style: 'sectionTitle' },
                { text: `Factura: ${this.safeText(compra.numeroFactura)}`, style: 'metaText' },
                { text: `NCF: ${this.safeText(compra.ncf)}`, style: 'metaText' },
                { text: `Fecha emisión: ${this.formatPdfDate(compra.fechaEmision)}`, style: 'metaText' },
                { text: `Fecha vencimiento: ${this.formatPdfDate(compra.fechaVencimiento)}`, style: 'metaText' },
                { text: `Moneda: ${this.safeText(compra.moneda)}`, style: 'metaText' },
                { text: `Tasa cambio: ${this.safeText(compra.tasaCambio ?? 1)}`, style: 'metaText' },
                { text: `Generado: ${this.formatPdfDate(now, true)}`, style: 'metaMuted' },
              ],
            },
          ],
          columnGap: 16,
          margin: [0, 0, 0, 14],
        },

        { text: 'Detalle de productos y servicios', style: 'sectionTitle', margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: [56, '*', 34, 44, 62, 58, 66],
            body: [
              [
                { text: 'Código', style: 'tableHeader' },
                { text: 'Producto/Servicio', style: 'tableHeader' },
                { text: 'Cant.', style: 'tableHeaderCenter' },
                { text: 'Unidad', style: 'tableHeaderCenter' },
                { text: 'Costo', style: 'tableHeaderRight' },
                { text: 'ITBIS', style: 'tableHeaderRight' },
                { text: 'Total', style: 'tableHeaderRight' },
              ],
              ...compra.items.map((item, index) => [
                { text: this.safeText(item.codigoInterno), style: index % 2 ? 'tableCellAlt' : 'tableCell' },
                { text: this.safeText(item.nombre), style: index % 2 ? 'tableCellAlt' : 'tableCell' },
                { text: this.safeText(item.cantidad), style: index % 2 ? 'tableCellAltCenter' : 'tableCellCenter' },
                { text: this.safeText(item.unidadMedidaCodigo), style: index % 2 ? 'tableCellAltCenter' : 'tableCellCenter' },
                { text: this.safeMoney(item.costoUnitario), style: index % 2 ? 'tableCellAltRight' : 'tableCellRight' },
                { text: this.safeMoney(item.montoItbis), style: index % 2 ? 'tableCellAltRight' : 'tableCellRight' },
                { text: this.safeMoney(item.total), style: index % 2 ? 'tableCellAltRight' : 'tableCellRight' },
              ]),
            ],
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex === 0 ? '#1E3A8A' : null),
            hLineColor: () => '#E5E7EB',
            vLineColor: () => '#E5E7EB',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },

        {
          margin: [0, 12, 0, 0],
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Resumen financiero', style: 'sectionTitle' },
                { text: `Estado compra: ${this.safeText(compra.estado)}`, style: 'metaText' },
                { text: `Afecta inventario: ${compra.afectaInventario ? 'Sí' : 'No'}`, style: 'metaText' },
                { text: `Inventario actualizado: ${compra.inventarioAfectado ? 'Sí' : 'No'}`, style: 'metaText' },
                { text: `Fecha creación: ${this.formatPdfDate(compra.fechaCreacion, true)}`, style: 'metaText' },
                { text: `Fecha confirmación: ${this.formatPdfDate(compra.fechaConfirmacion, true)}`, style: 'metaText' },
              ],
            },
            {
              width: 280,
              table: {
                widths: ['*', 'auto'],
                body: [
                  [{ text: 'Subtotal', style: 'totalLabel' }, { text: this.safeMoney(compra.subtotal), style: 'totalValue' }],
                  [{ text: 'Descuento', style: 'totalLabel' }, { text: this.safeMoney(compra.totalDescuento), style: 'totalValue' }],
                  [{ text: 'ITBIS', style: 'totalLabel' }, { text: this.safeMoney(compra.totalItbis), style: 'totalValue' }],
                  [{ text: 'Imp. adicionales', style: 'totalLabel' }, { text: this.safeMoney(compra.totalImpuestosAdicionales), style: 'totalValue' }],
                  [
                    { text: 'TOTAL', style: 'grandTotalLabel' },
                    { text: this.safeMoney(compra.total), style: 'grandTotalValue' },
                  ],
                ],
              },
              layout: {
                fillColor: (rowIndex) => (rowIndex === 4 ? '#F3F4F6' : null),
                hLineColor: () => '#E5E7EB',
                vLineColor: () => '#E5E7EB',
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 6,
                paddingBottom: () => 6,
              },
            },
          ],
          columnGap: 16,
        },
      ],
      styles: {
        brand: { fontSize: 11, bold: true, color: '#2563EB' },
        title: { fontSize: 18, bold: true, color: '#111827', margin: [0, 2, 0, 0] },
        statusChip: { fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#059669', margin: [8, 4, 8, 4] },

        sectionTitle: { fontSize: 11, bold: true, color: '#374151', margin: [0, 0, 0, 4] },
        metaText: { fontSize: 9, color: '#4B5563', margin: [0, 0, 0, 2] },
        metaMuted: { fontSize: 8, color: '#6B7280', margin: [0, 3, 0, 0] },

        tableHeader: { fontSize: 9, bold: true, color: '#F9FAFB' },
        tableHeaderCenter: { fontSize: 9, bold: true, color: '#F9FAFB', alignment: 'center' },
        tableHeaderRight: { fontSize: 9, bold: true, color: '#F9FAFB', alignment: 'right' },

        tableCell: { fontSize: 9, color: '#111827' },
        tableCellCenter: { fontSize: 9, color: '#111827', alignment: 'center' },
        tableCellRight: { fontSize: 9, color: '#111827', alignment: 'right' },

        tableCellAlt: { fontSize: 9, color: '#111827', fillColor: '#F9FAFB' },
        tableCellAltCenter: { fontSize: 9, color: '#111827', alignment: 'center', fillColor: '#F9FAFB' },
        tableCellAltRight: { fontSize: 9, color: '#111827', alignment: 'right', fillColor: '#F9FAFB' },

        totalLabel: { fontSize: 10, color: '#4B5563' },
        totalValue: { fontSize: 10, bold: true, color: '#111827', alignment: 'right' },
        grandTotalLabel: { fontSize: 13, bold: true, color: '#111827' },
        grandTotalValue: { fontSize: 13, bold: true, color: '#111827', alignment: 'right' },

        footerText: { fontSize: 8, color: '#6B7280' },
      },
    };
  }

  imprimirCompra(compra: Compra): void {
    this.configurarPdfMake();
    void this.ensureBrandingLoaded().finally(() => {
      pdfMake.createPdf(this.generarDocDefinitionCompra(compra)).print();
    });
  }

  guardarPdfCompra(compra: Compra): void {
    this.configurarPdfMake();
    void this.ensureBrandingLoaded().finally(() => {
      pdfMake.createPdf(this.generarDocDefinitionCompra(compra)).download(this.buildFileName(compra));
    });
  }

  abrirPreviewCompra(compra: Compra): void {
    this.configurarPdfMake();
    void this.ensureBrandingLoaded().finally(() => {
      pdfMake.createPdf(this.generarDocDefinitionCompra(compra)).open();
    });
  }

  /** Compatibilidad con código existente */
  generateCompraPdf(compra: Compra): void {
    this.guardarPdfCompra(compra);
  }
}
