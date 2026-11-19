import { of, Subject, throwError } from 'rxjs';
import { FinanzasPage } from './finanzas.page';

describe('Finanzas: integración del dashboard ejecutivo', () => {
  const invoice = {
    id: 'f1', estado: 'emitida', fecha: '2026-11-03T12:00:00', total: 118, impuesto: 18,
    items: [{ cantidad: 1, precioUnitario: 100, subtotal: 100, costoUnitario: 40, categoria: 'Ropa' }],
  };
  let page: FinanzasPage;
  let sources: jasmine.Spy[];

  beforeEach(() => {
    sources = Array.from({ length: 6 }, () => jasmine.createSpy().and.returnValue(of([])));
    sources[0].and.returnValue(of([{ fecha: '2026-11-03', tipo: 'gasto', monto: 20 }]));
    sources[5].and.returnValue(of([invoice, { ...invoice, id: 'prev', fecha: '2026-11-02T12:00:00' }]));
    page = new FinanzasPage(
      { list: sources[0] } as any, { list: sources[1] } as any,
      { listEnriquecida: sources[2] } as any, { listEnriquecida: sources[3] } as any,
      { list: sources[4] } as any, { getFacturas: sources[5] } as any,
      {} as any, {} as any, { theme: 'light' } as any, {} as any, {} as any,
    );
    page.onFechaDesdeChange('2026-11-03');
    page.onFechaHastaChange('2026-11-03');
  });

  it('recalcula fechas y comparaciones con una sola lectura por fuente y conserva las fórmulas operativas', () => {
    let latest: any;
    const sub = page.vm$.subscribe(value => latest = value);
    const second = page.vm$.subscribe();
    expect(latest.executive.current.netSales).toBe(100);
    expect(latest.executive.current.grossProfit).toBe(60);
    expect(latest.executive.previous.netSales).toBe(100);
    expect(latest.ingresos).toBe(118); // La métrica operativa histórica incluye ITBIS.
    expect(latest.balance).toBe(98);
    page.onFechaHastaChange('2026-11-04');
    expect(latest.executive.timeline.labels.length).toBe(2);
    page.onFechaDesdeChange('2026-11-04');
    expect(latest.executive.hasData).toBeFalse();
    expect(latest.ingresos).toBe(0);
    expect(latest.movimientos).toEqual([]);
    sources.forEach(source => expect(source).toHaveBeenCalledTimes(1));
    sub.unsubscribe(); second.unsubscribe();
  });

  it('expone carga mientras espera los datos', () => {
    const pending = new Subject<any[]>();
    sources[5].and.returnValue(pending);
    let latest: any = 'sin emisión';
    const sub = page.vm$.subscribe(value => latest = value);
    expect(latest).toBeNull();
    expect(page.dashboardError).toBe('');
    pending.next([]);
    expect(latest.executive.current.invoices).toBe(0);
    sub.unsubscribe();
  });

  it('permite recuperar un error sin dejar indicadores antiguos visibles', () => {
    spyOn(console, 'error');
    sources[5].and.returnValue(throwError(() => new Error('permission-denied')));
    let latest: any;
    const sub = page.vm$.subscribe(value => latest = value);
    expect(latest).toBeNull();
    expect(page.dashboardError).toContain('No pudimos cargar');
    sources[5].and.returnValue(of([invoice]));
    page.reintentarDashboard();
    expect(page.dashboardError).toBe('');
    expect(latest.executive.current.netSales).toBe(100);
    expect(sources[5]).toHaveBeenCalledTimes(2);
    sub.unsubscribe();
  });
});
