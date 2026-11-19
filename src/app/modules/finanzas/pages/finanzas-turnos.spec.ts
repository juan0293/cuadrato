import { FinanzasPage } from './finanzas.page';
import { TurnoCaja } from '../../facturacion/models/turno-caja.model';
import { Factura } from '../../facturacion/models/factura.model';

describe('Finanzas: consulta e impresión de turnos', () => {
  let page: FinanzasPage;
  let printer: { printShiftClose: jasmine.Spy; getFriendlyError: jasmine.Spy };
  let toast: { error: jasmine.Spy };
  const turno = { id: 'turno-1', numeroTurno: 'TRN-1', estado: 'cerrado',
    montoInicial: 100, totalVentas: 1000, totalEfectivo: 800, totalTarjeta: 200,
    totalTransferencia: 0, totalCredito: 0, cantidadFacturas: 2, efectivoEsperado: 900,
    efectivoContado: 895, diferencia: -5, fechaCierre: '2026-11-03T20:00:00Z',
    desgloseEfectivo: [{ denominacion: 5, cantidad: 179 }] } as TurnoCaja;
  const factura = { id: 'factura-1', turnoId: 'turno-1', fecha: '2026-11-03T18:00:00Z',
    estado: 'emitida', total: 9999, items: [{ descripcion: 'Producto vendido', cantidad: 2, precioUnitario: 100, total: 200 }] } as Factura;
  const vm = { facturasRaw: [factura, { ...factura, id: 'otra', turnoId: 'otro-turno' }] } as any;

  beforeEach(() => {
    page = Object.create(FinanzasPage.prototype);
    printer = { printShiftClose: jasmine.createSpy().and.resolveTo(), getFriendlyError: jasmine.createSpy().and.returnValue('Impresora desconectada') };
    toast = { error: jasmine.createSpy().and.resolveTo() };
    Object.assign(page, { invoicePrintingService: printer, toastService: toast, printingTurno: false });
  });

  it('Ver detalle conserva los productos y datos completos de las facturas vinculadas', () => {
    page.abrirDetalleTurno(turno, vm);
    expect(page.turnoDetalleOpen).toBeTrue();
    expect(page.turnoFacturasSeleccionadas).toEqual([factura]);
    expect(page.turnoFacturasSeleccionadas[0].items[0].descripcion).toBe('Producto vendido');
    expect(page.facturasExpandidas).toEqual(['factura-1']);
  });

  it('Ver facturas utiliza las mismas facturas completas y excluye otros turnos', () => {
    page.verFacturasTurno(turno, vm);
    expect(page.turnoFacturasOpen).toBeTrue();
    expect(page.turnoFacturasSeleccionadas).toEqual([factura]);
  });

  it('no mezcla facturas sin turno con un turno sin identificador', () => {
    page.verFacturasTurno({ ...turno, id: undefined }, { facturasRaw: [{ ...factura, turnoId: undefined }] } as any);
    expect(page.turnoFacturasSeleccionadas).toEqual([]);
  });

  it('preserva el cuadre cerrado aunque las facturas actuales tengan otros importes', () => {
    const enriched = (page as any).enriquecerTurnosConFacturas([turno], [factura]);
    expect(enriched[0]).toEqual(turno);
    expect(enriched[0].efectivoEsperado).toBe(900);
    expect(enriched[0].diferencia).toBe(-5);
  });

  it('envía al servicio de Facturación el cierre guardado con su desglose', async () => {
    const first = page.imprimirTurno(turno);
    await page.imprimirTurno(turno);
    await first;
    expect(printer.printShiftClose).toHaveBeenCalledOnceWith(turno);
    expect(page.printingTurno).toBeFalse();
  });

  it('reporta errores de impresión y libera el bloqueo', async () => {
    printer.printShiftClose.and.rejectWith(new Error('DISCONNECTED'));
    await page.imprimirTurno(turno);
    expect(toast.error).toHaveBeenCalledWith('Impresora desconectada');
    expect(page.printingTurno).toBeFalse();
  });

  it('requiere cerrar el turno para imprimir su cuadre definitivo', async () => {
    await page.imprimirTurno({ ...turno, estado: 'abierto' });
    expect(printer.printShiftClose).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
