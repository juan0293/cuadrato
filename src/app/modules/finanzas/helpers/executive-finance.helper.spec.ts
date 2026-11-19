import { Factura } from '../../facturacion/models/factura.model';
import { MovimientoFinanciero } from '../models/movimiento-financiero.model';
import { buildExecutiveDashboard, compareExecutive, summarizeExecutivePeriod } from './executive-finance.helper';

export const executiveInvoice = (extra: Partial<Factura> = {}): Factura => ({
  id: 'factura', estado: 'emitida', fecha: '2026-11-03T12:00:00', subtotal: 280, descuentoTotal: 30,
  impuesto: 45, itbisTotal: 45, total: 295, formaPago: 'credito',
  items: [
    { descripcion: 'A', cantidad: 2, precioUnitario: 100, descuento: 20, subtotal: 180, costoUnitario: 50, total: 212.4, categoria: 'Ropa' },
    { descripcion: 'B', cantidad: 1, precioUnitario: 100, subtotal: 100, costoUnitario: 40, total: 118, categoria: 'Accesorios' },
  ], ...extra,
} as Factura);

describe('Analítica ejecutiva: fórmulas verificables', () => {
  it('concilia descuentos de línea y global sin duplicarlos ni sumar ITBIS a ventas netas', () => {
    const p = summarizeExecutivePeriod([executiveInvoice()], []);
    expect(p.grossSales).toBe(300);
    expect(p.netSales).toBe(250);
    expect(p.taxes).toBe(45);
    expect(p.discounts).toBe(50);
    expect(p.costOfSales).toBe(140);
    expect(p.grossProfit).toBe(110);
    expect(p.grossMargin).toBe(44);
    expect(p.categories.values).toEqual([160.71, 89.29]);
    expect(p.categories.values.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it('incluye ventas a crédito y no trata la devuelta de efectivo como devolución comercial', () => {
    expect(summarizeExecutivePeriod([executiveInvoice({ devuelta: 500, totalPagado: 0 })], []).netSales).toBe(250);
  });

  it('excluye anuladas y borradores', () => {
    const p = summarizeExecutivePeriod([executiveInvoice(), executiveInvoice({ estado: 'anulada' }), executiveInvoice({ estado: 'borrador' })], []);
    expect(p.invoices).toBe(1);
    expect(p.netSales).toBe(250);
  });

  for (const costoUnitario of [undefined, 0, -1, NaN]) {
    it(`oculta costos y ganancias agregadas con costo incompleto: ${costoUnitario}`, () => {
      const invoice = executiveInvoice(); invoice.items[0] = { ...invoice.items[0], costoUnitario };
      const p = summarizeExecutivePeriod([invoice], []);
      expect(p.netSales).toBe(250);
      expect(p.costOfSales).toBeNull();
      expect(p.grossProfit).toBeNull();
      expect(p.grossMargin).toBeNull();
      expect(p.knownCostLines).toBe(1);
    });
  }

  it('no inventa detalle ni ganancias para facturas históricas sin líneas', () => {
    const p = summarizeExecutivePeriod([executiveInvoice({ items: [] })], []);
    expect(p.netSales).toBe(250);
    expect(p.grossSales).toBeNull();
    expect(p.grossProfit).toBeNull();
    expect(p.categories.labels).toEqual(['Sin detalle de productos']);
  });

  it('no asume ITBIS cero cuando el impuesto no se guardó', () => {
    const p = summarizeExecutivePeriod([executiveInvoice({ impuesto: undefined, itbisTotal: undefined } as any)], []);
    expect(p.netSales).toBeNull();
    expect(p.taxes).toBeNull();
    expect(p.grossProfit).toBeNull();
    expect(p.categories.values).toEqual([]);
  });

  it('separa otros ingresos y gastos sin duplicar ingresos asociados a facturas', () => {
    const movements = [
      { tipo: 'ingreso', categoria: 'facturacion', monto: 295, facturaId: 'factura' },
      { tipo: 'ingreso', categoria: 'otros-ingresos', monto: 20 },
      { tipo: 'gasto', categoria: 'renta', monto: 50 },
    ] as MovimientoFinanciero[];
    const p = summarizeExecutivePeriod([executiveInvoice()], movements);
    expect(p.otherIncome).toBe(20);
    expect(p.expenses).toBe(50);
    expect(p.grossProfit).toBe(110);
  });

  it('no divide entre cero y conserva la variación absoluta', () => {
    expect(compareExecutive(100, 0)).toEqual({ absolute: 100, percent: null });
    expect(compareExecutive(100, null)).toEqual({ absolute: null, percent: null });
    expect(compareExecutive(-10, -20)).toEqual({ absolute: 10, percent: null });
  });

  it('calcula un período anterior contiguo de igual duración y respeta límites de fechas', () => {
    const invoices = [executiveInvoice({ fecha: '2026-11-01T12:00:00', total: 145 }),
      executiveInvoice({ fecha: '2026-11-04T23:59:59' }), executiveInvoice({ fecha: '2026-11-05T00:00:00', total: 999 })];
    const report = buildExecutiveDashboard(invoices, [], '2026-11-03', '2026-11-04');
    expect(report.current.netSales).toBe(250);
    expect(report.previous!.netSales).toBe(100);
    expect(report.changes.netSales).toEqual({ absolute: 150, percent: 150 });
    expect(report.timeline.labels).toEqual(['2026-11-03', '2026-11-04']);
    expect(report.timeline.sales).toEqual([0, 250]);
  });

  it('usa huecos y no cero cuando falta costeo en la evolución de ganancias', () => {
    const invoice = executiveInvoice(); invoice.items[0].costoUnitario = undefined;
    const report = buildExecutiveDashboard([invoice], [], '2026-11-03', '2026-11-04');
    expect(report.timeline.profit).toEqual([null, 0]);
  });

  it('compara el margen con diferencia en puntos porcentuales y cambio relativo', () => {
    const report = buildExecutiveDashboard([
      executiveInvoice(), executiveInvoice({ fecha: '2026-11-02', total: 325, itbisTotal: 45 }),
    ], [], '2026-11-03', '2026-11-03');
    expect(report.previous!.grossMargin).toBe(50);
    expect(report.changes.grossMargin).toEqual({ absolute: -6, percent: -12 });
  });

  it('agrupa períodos extensos por mes y conserva las sumas', () => {
    const report = buildExecutiveDashboard([executiveInvoice()], [], '2026-01-01', '2026-12-31');
    expect(report.timeline.labels.length).toBe(12);
    expect(report.timeline.sales.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(250);
  });

  it('marca registros sin fecha y estados vacíos sin generar variaciones infinitas', () => {
    const report = buildExecutiveDashboard([executiveInvoice({ fecha: 'invalid' })], [], '2026-11-03', '2026-11-04');
    expect(report.invalidDates).toBe(1);
    expect(report.hasData).toBeFalse();
    expect(report.current.grossMargin).toBeNull();
    expect(report.changes.netSales.percent).toBeNull();
  });

  it('desactiva comparaciones con rangos abiertos', () => {
    const report = buildExecutiveDashboard([executiveInvoice()], [], '', '2026-11-04');
    expect(report.current.netSales).toBe(250);
    expect(report.previous).toBeNull();
  });

  it('conserva la venta del último día con inicio abierto aunque la primera factura tenga hora', () => {
    const report = buildExecutiveDashboard([executiveInvoice()], [], '', '2026-11-03');
    expect(report.timeline.labels).toEqual(['2026-11-03']);
    expect(report.timeline.sales).toEqual([250]);
  });
});
