import { ThermalPrinterService } from './thermal-printer.service';
import { DEFAULT_PRINTER_CONFIGURATION } from '../models/printer-configuration.model';
import { Factura } from '../models/factura.model';

describe('ThermalPrinterService: logo y corte', () => {
  let service: ThermalPrinterService;
  const factura = { fecha: '2026-09-29', items: [], total: 100, subtotal: 100 } as unknown as Factura;

  beforeEach(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#000';
    context.fillRect(0, 0, 16, 16);
    const profile = { companyTitle: 'Prueba' };
    service = new ThermalPrinterService({
      normalizeProfile: () => profile,
      getBrandingSnapshot: async () => ({ profile, logoDataUrl: canvas.toDataURL('image/png') }),
    } as any);
  });

  for (const [format, widthBytes] of [['ticket80', 72], ['ticket58', 48]] as const) {
    it(`incluye el logo rasterizado en ${format}`, async () => {
      const bytes = await service.buildInvoiceBytes(factura, {
        ...DEFAULT_PRINTER_CONFIGURATION, format, cutPaper: true,
      });
      // Tras inicializar la impresora y la tabla de caracteres, comienza el logo.
      expect(Array.from(bytes.slice(5, 11))).toEqual([0x1d, 0x76, 0x30, 0, widthBytes, 0]);
      const height = bytes[11] + bytes[12] * 256;
      expect(height).toBeGreaterThan(0);
      expect(Array.from(bytes.slice(13, 13 + widthBytes * height))).toContain(255);
      expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0]);
    });
  }

  it('omite el comando de corte cuando se selecciona corte manual', async () => {
    const bytes = await service.buildInvoiceBytes(factura, {
      ...DEFAULT_PRINTER_CONFIGURATION, format: 'ticket80', cutPaper: false,
    });
    expect(Array.from(bytes.slice(-4))).not.toEqual([0x1d, 0x56, 0x42, 0]);
    expect(bytes[bytes.length - 1]).toBe(0x0a);
  });
});
