import { Capacitor } from '@capacitor/core';
import { CuentaAbierta } from '../models/cuenta-abierta.model';
import { calcularCuenta, precuentaDocumento } from '../helpers/cuenta-abierta.helper';
import { DEFAULT_PRINTER_CONFIGURATION } from '../models/printer-configuration.model';
import { PdfFacturaService } from './pdf-factura.service';
import { ThermalPrinterService } from './thermal-printer.service';
import { InvoicePrintingService } from './invoice-printing.service';

describe('Precuentas: impresión sin venta ni cobro', () => {
  const profile = { companyTitle: 'Empresa', ticketSubtitle: 'FACTURA' };
  const company = { normalizeProfile: () => profile, getBrandingSnapshot: async () => ({ profile }), buildContactLine: () => 'Contacto' } as any;
  const cuenta = { ...calcularCuenta({ clienteNombre: 'Juan', clienteId: '', descuentoGlobal: 10,
    items: [{ descripcion: 'Bebida de prueba', cantidad: 2, precioUnitario: 100, descuento: 5, aplicaItbis: true, porcentajeItbis: 18, total: 0 }],
  }), id: 'CUENTA-1', creadaEn: '2026-11-03T12:00:00', creadaPor: 'u1', version: 2, estado: 'abierta' } as CuentaAbierta;

  for (const format of ['ticket58', 'ticket80', 'letter'] as const) {
    it(`produce una precuenta ${format} identificada sin NCF ni datos de pago`, () => {
      const doc = new PdfFacturaService(company).buildPrecuentaPdfDefinition(precuentaDocumento(cuenta), format);
      const text = JSON.stringify(doc.content);
      expect(text).toContain('PRECUENTA — NO VÁLIDA COMO FACTURA');
      expect(text).toContain('CUENTA-1'); expect(text).toContain('Juan');
      expect(text).toContain('Bebida de prueba');
      expect(text).not.toContain('NCF'); expect(text).not.toContain('PAGADO');
      expect(doc.pageSize).toEqual(format === 'letter' ? 'LETTER' : { width: format === 'ticket58' ? 164.41 : 226.77, height: 'auto' });
    });
  }

  for (const format of ['ticket58', 'ticket80'] as const) {
    it(`reutiliza ESC/POS ${format} sin presentar dinero recibido`, async () => {
      const bytes = await new ThermalPrinterService(company).buildInvoiceBytes(precuentaDocumento(cuenta), { ...DEFAULT_PRINTER_CONFIGURATION, format });
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain('PRECUENTA'); expect(text).toContain('Cuenta: CUENTA-1');
      expect(text).not.toContain('Pagado'); expect(text).not.toContain('NCF:');
      expect(text).not.toContain('Forma de pago'); expect(text).not.toContain('Devuelta');
    });
  }

  for (const transport of ['browser', 'webusb', 'webserial', 'qz', 'qz-printer'] as const) {
    it(`reutiliza la impresora configurada por ${transport}`, async () => {
      const config = { ...DEFAULT_PRINTER_CONFIGURATION, transport };
      const print = jasmine.createSpy().and.resolveTo();
      const pdf = { imprimirPrecuenta: jasmine.createSpy().and.resolveTo() };
      const service = new InvoicePrintingService({ load: async () => config } as any,
        {} as any, { printInvoice: print } as any, { printInvoice: print } as any, { printInvoice: print } as any, pdf as any);
      await service.printPrebill(cuenta);
      if (transport === 'browser') expect(pdf.imprimirPrecuenta).toHaveBeenCalledWith(precuentaDocumento(cuenta), 'ticket58');
      else expect(print).toHaveBeenCalledWith(precuentaDocumento(cuenta), config);
      expect(cuenta.estado).toBe('abierta');
    });
  }

  it('reutiliza el transporte nativo en Android', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const print = jasmine.createSpy().and.resolveTo();
    const service = new InvoicePrintingService({ load: async () => DEFAULT_PRINTER_CONFIGURATION } as any,
      { printInvoice: print } as any, {} as any, {} as any, {} as any, {} as any);
    await service.printPrebill(cuenta);
    expect(print).toHaveBeenCalledWith(precuentaDocumento(cuenta), DEFAULT_PRINTER_CONFIGURATION);
  });
});
