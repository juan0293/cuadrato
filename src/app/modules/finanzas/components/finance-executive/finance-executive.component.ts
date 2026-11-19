import { Component, Input, OnChanges } from '@angular/core';
import { formatCurrencyDOP } from '../../../../core/utils/currency.utils';
import { ExecutiveComparison, ExecutiveDashboard } from '../../helpers/executive-finance.helper';
import { FinanceChartSeries } from '../finance-chart/finance-chart.component';

interface ExecutiveMetric { label: string; value: number | null; description: string; percent?: boolean; change?: ExecutiveComparison; }

@Component({
  selector: 'app-finance-executive', standalone: false,
  templateUrl: './finance-executive.component.html', styleUrls: ['./finance-executive.component.scss'],
})
export class FinanceExecutiveComponent implements OnChanges {
  @Input() data!: ExecutiveDashboard;
  metrics: ExecutiveMetric[] = [];
  series: FinanceChartSeries[] = [];
  hasCategorySales = false;
  readonly comparisonLabels = ['Ventas netas', 'Costo de ventas', 'Gastos registrados', 'Otros ingresos'];
  readonly money = formatCurrencyDOP;

  ngOnChanges(): void {
    const c = this.data.current;
    this.hasCategorySales = c.categories.values.some(value => value > 0);
    this.metrics = [
      { label: 'Ventas brutas', value: c.grossSales, description: 'Cantidad × precio unitario, antes de descuentos y sin ITBIS.', change: this.data.changes.grossSales },
      { label: 'Ventas netas', value: c.netSales, description: 'Total facturado menos ITBIS. Incluye descuentos aplicados; no es efectivo cobrado.', change: this.data.changes.netSales },
      { label: 'Ganancia bruta estimada', value: c.grossProfit, description: 'Ventas netas menos costo histórico de las líneas vendidas.', change: this.data.changes.grossProfit },
      { label: 'Margen bruto', value: c.grossMargin, percent: true, description: 'Ganancia bruta / ventas netas × 100. Variación en puntos porcentuales (pp). Sin ventas, no aplica.', change: this.data.changes.grossMargin },
      { label: 'Ganancia neta', value: null, description: 'Requiere clasificar gastos operativos, evitar duplicar insumos y completar ajustes e impuestos.' },
      { label: 'Margen neto', value: null, percent: true, description: 'Pendiente de un resultado neto contable verificable.' },
    ];
    this.series = [
      { label: 'Ventas netas sin ITBIS', data: this.data.timeline.sales, color: '#155eef' },
      { label: 'Ganancia bruta estimada', data: this.data.timeline.profit, color: '#12b76a' },
    ];
  }
}
