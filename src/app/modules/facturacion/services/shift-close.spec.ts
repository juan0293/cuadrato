import { DENOMINACIONES_DOP, normalizarDesgloseEfectivo, totalDesgloseEfectivo, TurnoCaja } from '../models/turno-caja.model';
import { DEFAULT_PRINTER_CONFIGURATION } from '../models/printer-configuration.model';
import { ThermalPrinterService } from './thermal-printer.service';
import { InvoicePrintingService } from './invoice-printing.service';
import { PdfFacturaService } from './pdf-factura.service';
import { TurnosCajaService } from './turnos-caja.service';

describe('Cuadre de turno', () => {
  const turno: TurnoCaja = {
    id: 'turno-1', numeroTurno: 'TRN-20261103-1000', cajaId: 'principal', cajaNombre: 'Caja principal',
    usuarioId: 'usuario', usuarioNombre: 'Cajero', estado: 'cerrado',
    fechaApertura: '2026-11-03T12:00:00Z', fechaCierre: '2026-11-03T20:00:00Z',
    montoInicial: 1000, efectivoEsperado: 4000, efectivoContado: 3995, diferencia: -5,
    totalVentas: 5000, totalEfectivo: 3000, totalTarjeta: 1000, totalTransferencia: 500, totalCredito: 500,
    cantidadFacturas: 4, observacionCierre: 'Faltante de cinco pesos',
    desgloseEfectivo: DENOMINACIONES_DOP.map((denominacion) => ({ denominacion, cantidad: 2 })),
  };
  const branding = { companyTitle: 'Empresa de prueba', rnc: '123456789' };
  const company = { normalizeProfile: () => branding, getBrandingSnapshot: async () => ({ profile: branding }), buildContactLine: () => 'RNC 123456789' } as any;

  it('suma todas las denominaciones y rechaza cantidades fraccionarias o negativas', () => {
    expect(totalDesgloseEfectivo(normalizarDesgloseEfectivo(turno.desgloseEfectivo!))).toBe(7782);
    expect(DENOMINACIONES_DOP).toContain(10);
    expect(totalDesgloseEfectivo(normalizarDesgloseEfectivo([{ denominacion: 10, cantidad: 3 }]))).toBe(30);
    expect(() => normalizarDesgloseEfectivo([{ denominacion: 100, cantidad: 1.5 }])).toThrow();
    expect(() => normalizarDesgloseEfectivo([{ denominacion: 100, cantidad: -1 }])).toThrow();
  });

  for (const [format, columns] of [['ticket58', 32], ['ticket80', 48]] as const) {
    it(`ajusta el texto ESC/POS del cuadre a ${columns} columnas`, async () => {
      const bytes = await new ThermalPrinterService(company).buildShiftCloseBytes(turno, {
        ...DEFAULT_PRINTER_CONFIGURATION, format, cutPaper: false,
      });
      const text = String.fromCharCode(...bytes.slice(5));
      expect(text).toContain('CIERRE DE TURNO');
      expect(text).toContain('DESGLOSE DE EFECTIVO');
      expect(text).toContain('RD$2000 x 2');
      expect(text).toContain('RD$-5.00');
      expect(text.split('\n').every((line) => line.length <= columns)).toBeTrue();
    });
  }

  for (const format of ['ticket58', 'ticket80', 'letter'] as const) {
    it(`crea el PDF de cuadre en ${format} con desglose y cierre guardado`, () => {
      const doc = new PdfFacturaService(company).buildCierreTurnoPdfDefinition(turno, turno, 3995, '', format);
      if (format === 'letter') expect(doc.pageSize).toBe('LETTER');
      else expect((doc.pageSize as any).width).toBe(format === 'ticket58' ? 164.41 : 226.77);
      expect(JSON.stringify(doc.content)).toContain('DESGLOSE DE EFECTIVO');
      expect(JSON.stringify(doc.content)).toContain('2000');
    });
  }

  for (const transport of ['webusb', 'webserial', 'qz', 'qz-printer', 'browser'] as const) {
    it(`envía el cuadre por ${transport}`, async () => {
      const configuration = { ...DEFAULT_PRINTER_CONFIGURATION, transport };
      const raw = new Uint8Array([1, 2]);
      const thermal = { buildShiftCloseBytes: jasmine.createSpy().and.resolveTo(raw) };
      const usb = { printBytes: jasmine.createSpy().and.resolveTo() };
      const serial = { printBytes: jasmine.createSpy().and.resolveTo() };
      const qz = { printBytes: jasmine.createSpy().and.resolveTo() };
      const pdf = { imprimirCierreTurno: jasmine.createSpy().and.resolveTo() };
      const printing = new InvoicePrintingService({ load: async () => configuration } as any,
        thermal as any, serial as any, usb as any, qz as any, pdf as any);
      await printing.printShiftClose(turno);
      if (transport === 'browser') {
        expect(pdf.imprimirCierreTurno).toHaveBeenCalledWith(turno, turno, 3995, turno.observacionCierre, 'ticket58');
        expect(thermal.buildShiftCloseBytes).not.toHaveBeenCalled();
      } else {
        const target = transport === 'webusb' ? usb : transport === 'webserial' ? serial : qz;
        expect(target.printBytes).toHaveBeenCalledWith(raw, configuration);
      }
    });
  }

  it('desglosa pagos mixtos, descuenta devuelta y distingue crédito de tarjeta', async () => {
    const invoices = [
      { estado: 'emitida', total: 1000, formaPago: 'mixto', devuelta: 100,
        pagos: { efectivo: 600, tarjeta: 300, transferencia: 100, credito: 100 } },
      { estado: 'emitida', total: 200, formaPago: 'credito' },
    ];
    const query: any = { where: () => query, get: async () => ({ docs: invoices.map((invoice) => ({ data: () => invoice })) }) };
    const service = new TurnosCajaService({ firestore: { collection: () => query } } as any);
    const totals = await service.calcularTotalesTurno('turno-1');
    expect(totals).toEqual({ totalVentas: 1200, totalEfectivo: 500, totalTarjeta: 300,
      totalTransferencia: 100, totalCredito: 300, cantidadFacturas: 2 });
  });

  it('guarda las cantidades y usa su suma para cerrar con los totales recalculados', async () => {
    const update = jasmine.createSpy().and.resolveTo();
    const service = new TurnosCajaService({ firestore: { collection: () => ({ doc: () => ({ update }) }) } } as any);
    spyOn(service, 'calcularTotalesTurno').and.resolveTo({ totalVentas: 8000, totalEfectivo: 7000,
      totalTarjeta: 1000, totalTransferencia: 0, totalCredito: 0, cantidadFacturas: 10 });
    const closed = await service.cerrarTurno({ ...turno, estado: 'abierto' }, 0, 'Conteo', turno.desgloseEfectivo);
    expect(closed.efectivoContado).toBe(7782);
    expect(closed.efectivoEsperado).toBe(7000);
    expect(closed.diferencia).toBe(782);
    expect(closed.fondoInicialIncluidoEnConteo).toBeFalse();
    expect(closed.estado).toBe('cerrado');
    expect(update.calls.mostRecent().args[0].desgloseEfectivo).toEqual(turno.desgloseEfectivo);
    expect(update.calls.mostRecent().args[0].fechaCierre).toBe(closed.fechaCierre);
  });

  it('incluye el fondo únicamente cuando el cajero lo solicita explícitamente', async () => {
    const update = jasmine.createSpy().and.resolveTo();
    const service = new TurnosCajaService({ firestore: { collection: () => ({ doc: () => ({ update }) }) } } as any);
    spyOn(service, 'calcularTotalesTurno').and.resolveTo({ totalVentas: 8000, totalEfectivo: 7000,
      totalTarjeta: 1000, totalTransferencia: 0, totalCredito: 0, cantidadFacturas: 10 });
    const closed = await service.cerrarTurno({ ...turno, estado: 'abierto' }, 8000, '', undefined, true);
    expect(closed.efectivoEsperado).toBe(8000);
    expect(closed.diferencia).toBe(0);
    expect(closed.fondoInicialIncluidoEnConteo).toBeTrue();
  });

  it('reproduce el cierre auditado sin descontar devuelta dos veces ni exigir crédito, transferencia o fondo aparte', async () => {
    const efectivo = [195, 65, 50, 350, 290, 20, 340, 150, 195, 150, 75, 90];
    const cambios = [5, 0, 0, 50, 0, 0, 0, 0, 5, 0, 25, 0];
    const invoices = [
      ...efectivo.map((total, i) => ({ estado: 'emitida', total, formaPago: 'efectivo', devuelta: cambios[i],
        pagos: { efectivo: total, tarjeta: 0, transferencia: 0, credito: 0 } })),
      ...[200, 120, 230, 50].map(total => ({ estado: 'emitida', total, formaPago: 'credito',
        pagos: { efectivo: 0, tarjeta: 0, transferencia: 0, credito: total } })),
      { estado: 'emitida', total: 1310, formaPago: 'transferencia', pagos: { efectivo: 0, tarjeta: 0, transferencia: 1310, credito: 0 } },
    ];
    const query: any = { where: () => query, get: async () => ({ docs: invoices.map(invoice => ({ data: () => invoice })) }) };
    const update = jasmine.createSpy().and.resolveTo();
    const service = new TurnosCajaService({ firestore: { collection: (name: string) => name === 'facturas' ? query : { doc: () => ({ update }) } } } as any);
    const closed = await service.cerrarTurno({ ...turno, estado: 'abierto', montoInicial: 2000 }, 1895);
    expect(closed.totalVentas).toBe(3880);
    expect(closed.totalEfectivo).toBe(1970);
    expect(closed.totalTransferencia).toBe(1310);
    expect(closed.totalCredito).toBe(600);
    expect(closed.cantidadFacturas).toBe(17);
    expect(closed.efectivoEsperado).toBe(1970);
    expect(closed.diferencia).toBe(-75);
    const conciliado = await service.cerrarTurno({ ...turno, estado: 'abierto', montoInicial: 2000 }, 1970);
    expect(conciliado.diferencia).toBe(0);
  });

  it('usa Carta aunque el transporte anterior fuera WebUSB', async () => {
    const pdf = { imprimirCierreTurno: jasmine.createSpy().and.resolveTo() };
    const printing = new InvoicePrintingService({ load: async () => ({ ...DEFAULT_PRINTER_CONFIGURATION,
      transport: 'webusb', format: 'letter' }) } as any, {} as any, {} as any, {} as any, {} as any, pdf as any);
    await printing.printShiftClose(turno);
    expect(pdf.imprimirCierreTurno).toHaveBeenCalledWith(turno, turno, 3995, turno.observacionCierre, 'letter');
  });

  it('respeta la impresión desactivada', async () => {
    const printing = new InvoicePrintingService({ load: async () => ({ ...DEFAULT_PRINTER_CONFIGURATION,
      enabled: false }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expectAsync(printing.printShiftClose(turno)).toBeRejectedWithError('PRINTING_DISABLED');
  });
});
