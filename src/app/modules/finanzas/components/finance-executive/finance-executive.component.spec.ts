import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Chart } from 'chart.js';
import { Factura } from '../../../facturacion/models/factura.model';
import { buildExecutiveDashboard } from '../../helpers/executive-finance.helper';
import { FinanceChartComponent } from '../finance-chart/finance-chart.component';
import { FinanceExecutiveComponent } from './finance-executive.component';

describe('Vista ejecutiva: representación de gráficos', () => {
  let fixture: ComponentFixture<FinanceExecutiveComponent>;
  const invoice = {
    estado: 'emitida', fecha: '2026-11-03', total: 118, impuesto: 18,
    items: [{ cantidad: 1, precioUnitario: 100, subtotal: 100, costoUnitario: 40, categoria: 'Ropa' }],
  } as Factura;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule], declarations: [FinanceExecutiveComponent, FinanceChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FinanceExecutiveComponent);
  });
  afterEach(() => fixture.destroy());

  it('presenta indicadores y tres gráficos con los importes conciliados', () => {
    fixture.componentRef.setInput('data', buildExecutiveDashboard([invoice], [], '2026-11-03', '2026-11-03'));
    fixture.detectChanges();
    const canvases: HTMLCanvasElement[] = Array.from(fixture.nativeElement.querySelectorAll('canvas'));
    expect(canvases.length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.metric-grid article').length).toBe(6);
    expect(Chart.getChart(canvases[0])!.data.datasets.map(dataset => dataset.data)).toEqual([[100], [60]]);
    expect(Chart.getChart(canvases[2])!.data.datasets[0].data).toEqual([100]);
    const chart = Chart.getChart(canvases[0])!;
    fixture.destroy();
    expect(Chart.getChart(canvases[0])).toBeUndefined();
    expect(chart.canvas).toBeNull();
  });

  it('muestra ausencia de datos sin renderizar gráficos vacíos', () => {
    fixture.componentRef.setInput('data', buildExecutiveDashboard([], [], '2026-11-03', '2026-11-03'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No hay ventas ni movimientos');
  });

  it('omite ganancia no verificable conservando la serie de ventas', () => {
    const incomplete = { ...invoice, items: [{ ...invoice.items[0], costoUnitario: undefined }] };
    fixture.componentRef.setInput('data', buildExecutiveDashboard([incomplete], [], '2026-11-03', '2026-11-03'));
    fixture.detectChanges();
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(Chart.getChart(canvas)!.data.datasets[1].data).toEqual([null]);
    expect(fixture.nativeElement.textContent).toContain('No disponible');
  });
});
