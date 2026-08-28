import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Subscription, combineLatest } from 'rxjs';
import * as XLSX from 'xlsx';
import { formatCurrencyDOP } from '../../../core/utils/currency.utils';
import { MovimientoFinanciero } from '../models/movimiento-financiero.model';
import { FinanzasService } from '../services/finanzas.service';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { UsuarioModel } from '../../usuarios/models/usuario.model';
import { FacturacionService } from '../../facturacion/services/facturacion.service';
import { Factura } from '../../facturacion/models/factura.model';

Chart.register(...registerables);

type FiltroRapido = 'hoy' | 'semana' | 'mes' | 'ingresos' | 'gastos';

interface MovimientoFinancieroView extends MovimientoFinanciero {
  metodoPago?: string;
  estado?: string;
  origen?: 'movimiento' | 'factura';
  numeroFactura?: string;
}

@Component({
  standalone: false,
  selector: 'app-movimientos-financieros',
  templateUrl: './movimientos-financieros.page.html',
  styleUrls: ['./movimientos-financieros.page.scss'],
})
export class MovimientosFinancierosPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('ingresosVsGastosCanvas') ingresosVsGastosCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoriasCanvas') categoriasCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('tendenciaCanvas') tendenciaCanvas?: ElementRef<HTMLCanvasElement>;

  loading = true;
  loadError = false;
  selectedQuickFilter: FiltroRapido | null = null;

  movimientos: MovimientoFinancieroView[] = [];
  movimientosFiltrados: MovimientoFinancieroView[] = [];
  facturas: Factura[] = [];
  usuarios: UsuarioModel[] = [];

  query = '';
  filtroTipo: 'todos' | 'ingreso' | 'gasto' = 'todos';
  filtroCategoria = 'todas';
  filtroMetodoPago = 'todos';
  filtroUsuario = 'todos';
  filtroEstado = 'todos';
  filtroFechaDesde = '';
  filtroFechaHasta = '';

  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [5, 10, 20, 50];

  formatCurrency = formatCurrencyDOP;

  private readonly sub = new Subscription();
  private viewReady = false;
  private chartRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private ingresosVsGastosChart?: Chart;
  private categoriasChart?: Chart;
  private tendenciaChart?: Chart;

  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly usuariosService: UsuariosService,
    private readonly facturacionService: FacturacionService,
  ) {}

  ngOnInit(): void {
    this.setDefaultMonthRange();
    this.sub.add(
      combineLatest([
        this.finanzasService.list(),
        this.facturacionService.getFacturas(),
      ]).subscribe({
        next: ([items, facturas]) => {
          this.facturas = facturas || [];
          this.movimientos = this.buildVistaMovimientos(items || [], this.facturas)
            .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
          this.loading = false;
          this.loadError = false;
          this.applyFilters();
          this.refreshChartsIfReady();
        },
        error: () => {
          this.loading = false;
          this.loadError = true;
        },
      }),
    );
    this.sub.add(
      this.usuariosService.list().subscribe({
        next: (items) => {
          this.usuarios = items || [];
        },
      }),
    );
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.refreshChartsIfReady();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.chartRefreshTimer) {
      clearTimeout(this.chartRefreshTimer);
      this.chartRefreshTimer = null;
    }
    this.ingresosVsGastosChart?.destroy();
    this.categoriasChart?.destroy();
    this.tendenciaChart?.destroy();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleChartRefresh(120);
  }

  get fechaActualLabel(): string {
    return new Intl.DateTimeFormat('es-DO', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }

  get categoriasDisponibles(): string[] {
    return Array.from(new Set(this.movimientos.map((item) => String(item.categoria || '').trim()).filter(Boolean))).sort();
  }

  get usuariosDisponibles(): string[] {
    return Array.from(new Set(this.movimientos.map((item) => String(item.creadoPor || '').trim()).filter(Boolean))).sort();
  }

  getUsuarioNombre(uid: string | null | undefined): string {
    const id = String(uid || '').trim();
    if (!id) return '—';
    const user = this.usuarios.find((u) => String(u.id || '') === id);
    return user?.displayName || user?.nombre || id;
  }

  get metodosPagoDisponibles(): string[] {
    return Array.from(new Set(this.movimientos.map((item) => String(this.getMetodoPago(item)).trim()).filter(Boolean))).sort();
  }

  get estadosDisponibles(): string[] {
    return Array.from(new Set(this.movimientos.map((item) => String(this.getEstado(item)).trim()).filter(Boolean))).sort();
  }

  get totalIngresos(): number {
    return this.movimientosFiltrados
      .filter((item) => item.tipo === 'ingreso')
      .reduce((acc, item) => acc + this.toNumber(item.monto), 0);
  }

  get totalGastos(): number {
    return this.movimientosFiltrados
      .filter((item) => item.tipo === 'gasto')
      .reduce((acc, item) => acc + this.toNumber(item.monto), 0);
  }

  get balanceNeto(): number {
    return Number((this.totalIngresos - this.totalGastos).toFixed(2));
  }

  get movimientosHoy(): number {
    const today = new Date();
    return this.movimientosFiltrados.filter((item) => {
      const d = this.parseDate(item.fecha);
      return d && this.isSameDate(d, today);
    }).length;
  }

  get movimientosMes(): number {
    const now = new Date();
    return this.movimientosFiltrados.filter((item) => {
      const d = this.parseDate(item.fecha);
      return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }

  get promedioDiario(): number {
    const buckets = new Set(
      this.movimientosFiltrados
        .map((item) => this.parseDate(item.fecha))
        .filter((d): d is Date => !!d)
        .map((d) => d.toISOString().slice(0, 10)),
    );
    if (!buckets.size) return 0;
    return Number(((this.totalIngresos + this.totalGastos) / buckets.size).toFixed(2));
  }

  get ultimoMovimientoLabel(): string {
    if (!this.movimientosFiltrados.length) return '—';
    return this.formatDateTime(this.movimientosFiltrados[0].fecha);
  }

  get flujoFinanciero(): string {
    if (this.balanceNeto > 0) return 'Positivo';
    if (this.balanceNeto < 0) return 'Negativo';
    return 'Neutral';
  }

  get balanceDisponible(): number {
    return this.balanceNeto;
  }

  get categoriaTopGasto(): string {
    const grouped = new Map<string, number>();
    this.movimientosFiltrados.filter((item) => item.tipo === 'gasto').forEach((item) => {
      const key = String(item.categoria || 'Sin categoría');
      grouped.set(key, (grouped.get(key) || 0) + this.toNumber(item.monto));
    });
    let top = '—';
    let max = -1;
    grouped.forEach((value, key) => {
      if (value > max) {
        max = value;
        top = key;
      }
    });
    return top;
  }

  get categoriaTopIngreso(): string {
    const grouped = new Map<string, number>();
    this.movimientosFiltrados.filter((item) => item.tipo === 'ingreso').forEach((item) => {
      const key = String(item.categoria || 'Sin categoría');
      grouped.set(key, (grouped.get(key) || 0) + this.toNumber(item.monto));
    });
    let top = '—';
    let max = -1;
    grouped.forEach((value, key) => {
      if (value > max) {
        max = value;
        top = key;
      }
    });
    return top;
  }

  get ventasFacturadas(): number {
    return this.movimientosFiltrados
      .filter((item) => item.tipo === 'ingreso' && item.origen === 'factura')
      .reduce((acc, item) => acc + this.toNumber(item.monto), 0);
  }

  get otrosIngresos(): number {
    return this.movimientosFiltrados
      .filter((item) => item.tipo === 'ingreso' && item.origen !== 'factura')
      .reduce((acc, item) => acc + this.toNumber(item.monto), 0);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.movimientosFiltrados.length / this.pageSize));
  }

  get canGoPrev(): boolean {
    return this.page > 1;
  }

  get canGoNext(): boolean {
    return this.page < this.totalPages;
  }

  get pagedMovimientos(): MovimientoFinancieroView[] {
    const start = (this.page - 1) * this.pageSize;
    return this.movimientosFiltrados.slice(start, start + this.pageSize);
  }

  get hasData(): boolean {
    return this.movimientosFiltrados.length > 0;
  }

  onSearch(value: string | null | undefined): void {
    this.query = String(value || '');
    this.applyFilters();
  }

  onTipoChange(value: 'todos' | 'ingreso' | 'gasto'): void {
    this.filtroTipo = value;
    this.applyFilters();
  }

  onCategoriaChange(value: string): void {
    this.filtroCategoria = String(value || 'todas');
    this.applyFilters();
  }

  onMetodoPagoChange(value: string): void {
    this.filtroMetodoPago = String(value || 'todos');
    this.applyFilters();
  }

  onUsuarioChange(value: string): void {
    this.filtroUsuario = String(value || 'todos');
    this.applyFilters();
  }

  onEstadoChange(value: string): void {
    this.filtroEstado = String(value || 'todos');
    this.applyFilters();
  }

  onFechaDesdeChange(value: string | null | undefined): void {
    this.filtroFechaDesde = String(value || '');
    this.applyFilters();
  }

  onFechaHastaChange(value: string | null | undefined): void {
    this.filtroFechaHasta = String(value || '');
    this.applyFilters();
  }

  applyQuickFilter(filter: FiltroRapido): void {
    const now = new Date();
    this.selectedQuickFilter = this.selectedQuickFilter === filter ? null : filter;
    if (!this.selectedQuickFilter) {
      this.filtroFechaDesde = '';
      this.filtroFechaHasta = '';
      this.filtroTipo = 'todos';
      this.applyFilters();
      return;
    }

    if (filter === 'hoy') {
      const d = now.toISOString().slice(0, 10);
      this.filtroFechaDesde = d;
      this.filtroFechaHasta = d;
      this.filtroTipo = 'todos';
    } else if (filter === 'semana') {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      this.filtroFechaDesde = from.toISOString().slice(0, 10);
      this.filtroFechaHasta = now.toISOString().slice(0, 10);
      this.filtroTipo = 'todos';
    } else if (filter === 'mes') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      this.filtroFechaDesde = from.toISOString().slice(0, 10);
      this.filtroFechaHasta = to.toISOString().slice(0, 10);
      this.filtroTipo = 'todos';
    } else if (filter === 'ingresos') {
      this.filtroTipo = 'ingreso';
    } else if (filter === 'gastos') {
      this.filtroTipo = 'gasto';
    }
    this.applyFilters();
  }

  onPageSizeChange(value: number): void {
    this.pageSize = Number(value || 10);
    this.page = 1;
  }

  prevPage(): void {
    if (this.canGoPrev) this.page -= 1;
  }

  nextPage(): void {
    if (this.canGoNext) this.page += 1;
  }

  exportarExcelMovimientosRecientes(): void {
    const rows = this.pagedMovimientos.map((item) => ({
      Fecha: this.formatDate(item.fecha),
      Tipo: String(item.tipo || '').toUpperCase(),
      Categoria: item.categoria || '—',
      Descripcion: item.descripcion || '—',
      MetodoPago: this.getMetodoPago(item),
      Monto: this.toNumber(item.monto),
      Usuario: this.getUsuarioNombre(item.creadoPor),
      Estado: this.getEstado(item),
      Origen: item.origen || 'movimiento',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MovimientosRecientes');
    XLSX.writeFile(workbook, `movimientos-recientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  formatDate(value: string): string {
    const date = this.parseDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  formatDateTime(value: string): string {
    const date = this.parseDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  estadoColor(item: MovimientoFinancieroView): 'success' | 'danger' | 'primary' | 'warning' | 'medium' {
    const estado = this.getEstado(item).toLowerCase();
    if (estado.includes('anulad')) return 'medium';
    const tipo = String(item.tipo || '').toLowerCase();
    if (tipo === 'ingreso') return 'success';
    if (tipo === 'gasto') return 'danger';
    if (tipo === 'transferencia') return 'primary';
    if (tipo === 'ajuste') return 'warning';
    return 'primary';
  }

  private applyFilters(): void {
    const q = this.query.trim().toLowerCase();
    this.movimientosFiltrados = this.movimientos.filter((item) => {
      const tipo = String(item.tipo || '').toLowerCase();
      const categoria = String(item.categoria || '');
      const descripcion = String(item.descripcion || '');
      const creadoPor = String(item.creadoPor || '');
      const creadoPorLabel = this.getUsuarioNombre(creadoPor);
      const metodo = this.getMetodoPago(item);
      const estado = this.getEstado(item);
      const numeroFactura = String(item.numeroFactura || '');
      const date = this.parseDate(item.fecha);

      const matchesText = !q || [categoria, descripcion, creadoPor, creadoPorLabel, metodo, estado, numeroFactura].some((v) => v.toLowerCase().includes(q));
      const matchesTipo = this.filtroTipo === 'todos' || tipo === this.filtroTipo;
      const matchesCategoria = this.filtroCategoria === 'todas' || categoria === this.filtroCategoria;
      const matchesMetodo = this.filtroMetodoPago === 'todos' || metodo === this.filtroMetodoPago;
      const matchesUsuario = this.filtroUsuario === 'todos' || creadoPor === this.filtroUsuario;
      const matchesEstado = this.filtroEstado === 'todos' || estado === this.filtroEstado;
      const fromOk = !this.filtroFechaDesde || (!!date && date >= new Date(`${this.filtroFechaDesde}T00:00:00`));
      const toOk = !this.filtroFechaHasta || (!!date && date <= new Date(`${this.filtroFechaHasta}T23:59:59`));

      return matchesText && matchesTipo && matchesCategoria && matchesMetodo && matchesUsuario && matchesEstado && fromOk && toOk;
    });

    this.page = 1;
    this.scheduleChartRefresh();
  }

  private refreshChartsIfReady(): void {
    if (!this.viewReady) return;
    this.renderIngresosVsGastosChart();
    this.renderCategoriasChart();
    this.renderTendenciaChart();
  }

  private renderIngresosVsGastosChart(): void {
    const canvas = this.ingresosVsGastosCanvas?.nativeElement;
    if (!canvas) return;
    this.ingresosVsGastosChart?.destroy();

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [
          {
            label: 'Monto',
            data: [this.totalIngresos, this.totalGastos],
            backgroundColor: ['#34D399', '#F87171'],
            borderRadius: 8,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    };
    this.ingresosVsGastosChart = new Chart(canvas, config);
  }

  private renderCategoriasChart(): void {
    const canvas = this.categoriasCanvas?.nativeElement;
    if (!canvas) return;
    this.categoriasChart?.destroy();

    const grouped = new Map<string, number>();
    this.movimientosFiltrados.forEach((item) => {
      const key = String(item.categoria || 'Sin categoría');
      grouped.set(key, (grouped.get(key) || 0) + this.toNumber(item.monto));
    });

    const labels = Array.from(grouped.keys()).slice(0, 8);
    const values = labels.map((label) => grouped.get(label) || 0);

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: ['#3B82F6', '#38BDF8', '#34D399', '#F59E0B', '#F87171', '#A78BFA', '#22D3EE', '#94A3B8'],
            borderColor: 'rgba(255,255,255,0.2)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#E5EDFF', boxWidth: 12 },
          },
        },
      },
    };

    this.categoriasChart = new Chart(canvas, config);
  }

  private renderTendenciaChart(): void {
    const canvas = this.tendenciaCanvas?.nativeElement;
    if (!canvas) return;
    this.tendenciaChart?.destroy();

    const buckets = new Map<string, { ingresos: number; gastos: number }>();
    this.movimientosFiltrados.forEach((item) => {
      const d = this.parseDate(item.fecha);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      const current = buckets.get(key) || { ingresos: 0, gastos: 0 };
      if (item.tipo === 'ingreso') current.ingresos += this.toNumber(item.monto);
      if (item.tipo === 'gasto') current.gastos += this.toNumber(item.monto);
      buckets.set(key, current);
    });

    const labels = Array.from(buckets.keys()).sort().slice(-30);
    const ingresos = labels.map((label) => Number((buckets.get(label)?.ingresos || 0).toFixed(2)));
    const gastos = labels.map((label) => Number((buckets.get(label)?.gastos || 0).toFixed(2)));

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: ingresos, borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.2)', fill: true, tension: 0.3 },
          { label: 'Gastos', data: gastos, borderColor: '#F87171', backgroundColor: 'rgba(248,113,113,0.15)', fill: true, tension: 0.3 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#E5EDFF', boxWidth: 12 } },
        },
      },
    };

    this.tendenciaChart = new Chart(canvas, config);
  }

  /**
   * Espera a que Angular pinte los canvas (por *ngIf) antes de instanciar Chart.js.
   * Evita casos donde el gráfico no aparece por render prematuro del DOM.
   */
  private scheduleChartRefresh(delayMs = 0): void {
    if (this.chartRefreshTimer) {
      clearTimeout(this.chartRefreshTimer);
    }
    this.chartRefreshTimer = setTimeout(() => {
      this.refreshChartsIfReady();
    }, delayMs);
  }

  getMetodoPago(item: MovimientoFinancieroView): string {
    return String(item.metodoPago || '—');
  }

  getEstado(item: MovimientoFinancieroView): string {
    return String(item.estado || 'aprobado');
  }

  private parseDate(value: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private isSameDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private setDefaultMonthRange(): void {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.filtroFechaDesde = firstDay.toISOString().slice(0, 10);
    this.filtroFechaHasta = lastDay.toISOString().slice(0, 10);
  }

  private buildVistaMovimientos(
    movimientos: MovimientoFinanciero[],
    facturas: Factura[],
  ): MovimientoFinancieroView[] {
    const movimientosBase = movimientos
      .filter((item) => !this.isIngresoFacturacion(item))
      .map((item) => ({
        ...item,
        metodoPago: this.getMetodoPagoFromMovimiento(item),
        estado: this.getEstadoFromMovimiento(item),
        origen: 'movimiento' as const,
      }));

    const ingresosFacturados = facturas
      .filter((factura) => this.esFacturaContable(factura))
      .map((factura) => this.mapFacturaToMovimiento(factura));

    return [...movimientosBase, ...ingresosFacturados];
  }

  private mapFacturaToMovimiento(factura: Factura): MovimientoFinancieroView {
    return {
      id: `factura-${factura.id || factura.numero || factura.numeroFactura || factura.fecha}`,
      tipo: 'ingreso',
      categoria: 'facturacion',
      monto: this.toNumber(factura.total),
      descripcion: `Factura ${factura.numero || factura.numeroFactura || 'sin numero'} · ${factura.clienteNombre || 'Consumidor final'}`,
      artistaId: factura.artistaId,
      citaId: factura.citaId,
      facturaId: factura.id,
      fecha: String(factura.fecha || factura.creadoEn || ''),
      creadoPor: String(factura.creadaPor || ''),
      metodoPago: this.getMetodoPagoFromFactura(factura),
      estado: factura.estado || 'emitida',
      origen: 'factura',
      numeroFactura: String(factura.numero || factura.numeroFactura || ''),
    };
  }

  private esFacturaContable(factura: Factura): boolean {
    const estado = String(factura.estado || '').toLowerCase();
    return estado === 'emitida' || estado === 'pagada';
  }

  private isIngresoFacturacion(item: MovimientoFinanciero): boolean {
    const categoria = String(item.categoria || '').toLowerCase().trim();
    return item.tipo === 'ingreso' && (!!item.facturaId || categoria === 'facturacion');
  }

  private getMetodoPagoFromFactura(factura: Factura): string {
    const pagos = factura.pagos;
    if (pagos) {
      if (this.toNumber(pagos.credito ?? pagos.totalCredito) > 0) return 'credito';
      if (
        this.toNumber(pagos.efectivo) > 0 &&
        (this.toNumber(pagos.tarjeta) > 0 || this.toNumber(pagos.transferencia) > 0)
      ) return 'mixto';
      if (this.toNumber(pagos.efectivo) > 0) return 'efectivo';
      if (this.toNumber(pagos.tarjeta) > 0) return 'tarjeta';
      if (this.toNumber(pagos.transferencia) > 0) return 'transferencia';
    }
    return String(factura.formaPago || '—');
  }

  private getMetodoPagoFromMovimiento(item: MovimientoFinanciero): string {
    return String((item as unknown as { metodoPago?: string }).metodoPago || '—');
  }

  private getEstadoFromMovimiento(item: MovimientoFinanciero): string {
    return String((item as unknown as { estado?: string }).estado || 'aprobado');
  }
}
