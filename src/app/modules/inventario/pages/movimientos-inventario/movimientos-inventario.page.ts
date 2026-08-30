import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { Subscription, combineLatest } from 'rxjs';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, BarController } from 'chart.js';
import * as XLSX from 'xlsx';
import { MovimientoInventario } from '../../models/movimiento-inventario.model';
import { MovimientosInventarioService } from '../../services/movimientos-inventario.service';
import { InventarioThemeService } from '../../services/inventario-theme.service';
import { UsuariosService } from '../../../usuarios/services/usuarios.service';
import { UsuarioModel } from '../../../usuarios/models/usuario.model';

interface QuickAction {
  title: string;
  description: string;
  route: string;
  icon: string;
}

interface InsightItem {
  title: string;
  detail: string;
  level: 'info' | 'warning' | 'ok';
}

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, BarController);

@Component({
  selector: 'app-movimientos-inventario',
  templateUrl: './movimientos-inventario.page.html',
  styleUrls: ['./movimientos-inventario.page.scss'],
  standalone: false,
})
export class MovimientosInventarioPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('tipoChartCanvas') tipoChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('tendenciaChartCanvas') tendenciaChartCanvas?: ElementRef<HTMLCanvasElement>;

  movimientos: MovimientoInventario[] = [];
  movimientosFiltrados: MovimientoInventario[] = [];
  usuarios: UsuarioModel[] = [];
  loading = true;
  loadError = false;

  query = '';
  filtroTipo = 'todos';
  filtroFechaDesde = '';
  filtroFechaHasta = '';
  filtroResponsable = '';
  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];

  insights: InsightItem[] = [];

  readonly quickActions: QuickAction[] = [
    { title: 'Registrar movimiento', description: 'Crear entrada, salida o ajuste manual', route: '/admin/inventario/movimientos-inventario/nuevo', icon: 'add-circle-outline' },
    { title: 'Ver catálogo', description: 'Consultar productos y servicios', route: '/admin/inventario/productos-servicios', icon: 'cube-outline' },
    { title: 'Compras', description: 'Revisar entradas por factura', route: '/admin/inventario/compras', icon: 'receipt-outline' },
    { title: 'Volver a inventario', description: 'Regresar al dashboard principal', route: '/admin/inventario', icon: 'arrow-back-outline' },
  ];

  private sub?: Subscription;
  private tipoChart?: Chart;
  private tendenciaChart?: Chart;
  private viewReady = false;

  constructor(
    private readonly movimientosService: MovimientosInventarioService,
    private readonly router: Router,
    private readonly usuariosService: UsuariosService,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly alertCtrl: AlertController,
    private readonly themeService: InventarioThemeService,
  ) {}

  ngOnInit(): void {
    this.setDefaultMonthDateRange();

    this.sub = combineLatest([this.movimientosService.list(), this.usuariosService.list()]).subscribe({
      next: ([items, usuarios]) => {
        this.usuarios = usuarios || [];
        this.movimientos = [...items].sort((a, b) => {
          const da = this.parseDate(a.fecha).getTime();
          const db = this.parseDate(b.fecha).getTime();
          return db - da;
        });
        this.applyFilters();
        this.loading = false;
        this.loadError = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.refreshChartsIfReady();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.tipoChart?.destroy();
    this.tendenciaChart?.destroy();
  }

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }

  trackByMovimiento(_: number, movimiento: MovimientoInventario): string {
    return [
      movimiento.id || movimiento.fecha || 'mov',
      movimiento.productoId || movimiento.insumoId || movimiento.productoNombre || movimiento.insumoNombre || 'item',
      movimiento.referenciaId || movimiento.referenciaTipo || 'ref',
    ].join('-');
  }

  exportarExcel(): void {
    const rows = this.movimientosFiltrados.map((m) => ({
      Fecha: this.formatDate(m.fecha, true),
      Tipo: this.movimientoLabel(this.getTipoValue(m)),
      Producto: m.productoNombre || m.insumoNombre || '—',
      Codigo: m.productoId || m.insumoId || '—',
      Cantidad: this.toNumber(m.cantidad),
      CostoUnitario: this.toNumber(m.costoUnitario),
      ValorTotal: this.getValorTotal(m),
      Referencia: m.referenciaId || m.referenciaTipo || '—',
      Responsable: this.getResponsableNombre(m),
      Estado: 'Registrado',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    XLSX.writeFile(workbook, `movimientos-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async openMobileActions(movimiento: MovimientoInventario): Promise<void> {
    const buttons = [
      { text: 'Ver detalle', icon: 'eye-outline', handler: () => this.presentMovimientoDetalle(movimiento) },
      {
        text: 'Filtrar producto',
        icon: 'search-outline',
        handler: () => {
          this.query = String(movimiento.productoNombre || movimiento.insumoNombre || '');
          this.applyFilters();
        },
      },
      {
        text: 'Filtrar responsable',
        icon: 'person-outline',
        handler: () => {
          this.filtroResponsable = this.getResponsableNombre(movimiento) === '—' ? '' : this.getResponsableNombre(movimiento);
          this.applyFilters();
        },
      },
      { text: 'Cerrar', role: 'cancel', icon: 'close-outline' },
    ];

    const sheet = await this.actionSheetCtrl.create({
      header: 'Opciones del movimiento',
      buttons,
    });
    await sheet.present();
  }

  private async presentMovimientoDetalle(movimiento: MovimientoInventario): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: movimiento.productoNombre || movimiento.insumoNombre || 'Movimiento de inventario',
      subHeader: this.movimientoLabel(this.getTipoValue(movimiento)),
      message: [
        `Fecha: ${this.formatDate(movimiento.fecha, true)}`,
        `Cantidad: ${this.toNumber(movimiento.cantidad)}`,
        `Costo unitario: ${this.formatMoney(movimiento.costoUnitario)}`,
        `Valor total: ${this.formatMoney(this.getValorTotal(movimiento))}`,
        `Responsable: ${this.getResponsableNombre(movimiento)}`,
        `Referencia: ${movimiento.referenciaId || movimiento.referenciaTipo || '—'}`,
      ].join('<br>'),
      buttons: ['Cerrar'],
    });
    await alert.present();
  }

  onSearch(value: string | null | undefined): void {
    this.query = String(value || '');
    this.applyFilters();
  }

  onTipoChange(value: string): void {
    this.filtroTipo = value;
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

  onResponsableChange(value: string | null | undefined): void {
    this.filtroResponsable = String(value || '');
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.query.trim().toLowerCase();
    const resp = this.filtroResponsable.trim().toLowerCase();
    const start = this.filtroFechaDesde ? new Date(`${this.filtroFechaDesde}T00:00:00`) : null;
    const end = this.filtroFechaHasta ? new Date(`${this.filtroFechaHasta}T23:59:59`) : null;

    this.movimientosFiltrados = this.movimientos.filter((m) => {
      const label = this.movimientoLabel(this.getTipoValue(m));
      const product = String(m.productoNombre || m.insumoNombre || '').toLowerCase();
      const referencia = String(m.referenciaId || m.referenciaTipo || '').toLowerCase();
      const motivo = String(m.motivo || '').toLowerCase();
      const creadoPor = String(this.getResponsableNombre(m) || '').toLowerCase();
      const matchText = !q || [product, referencia, motivo, label.toLowerCase()].some((v) => v.includes(q));
      const matchTipo = this.filtroTipo === 'todos' || this.getTipoGrupo(m) === this.filtroTipo;
      const matchResp = !resp || creadoPor.includes(resp);
      const date = this.parseDate(m.fecha);
      const validDate = !Number.isNaN(date.getTime());
      const matchDesde = !start || (validDate && date >= start);
      const matchHasta = !end || (validDate && date <= end);
      return matchText && matchTipo && matchResp && matchDesde && matchHasta;
    });

    this.page = 1;
    this.buildInsights();
    this.refreshChartsIfReady();
  }

  get pagedMovimientos(): MovimientoInventario[] {
    const start = (this.page - 1) * this.pageSize;
    return this.movimientosFiltrados.slice(start, start + this.pageSize);
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

  get hasActiveFilters(): boolean {
    return Boolean(
      this.query.trim()
      || this.filtroResponsable.trim()
      || this.filtroFechaDesde
      || this.filtroFechaHasta
      || this.filtroTipo !== 'todos'
    );
  }

  prevPage(): void {
    if (!this.canGoPrev) return;
    this.page -= 1;
  }

  nextPage(): void {
    if (!this.canGoNext) return;
    this.page += 1;
  }

  onPageSizeChange(value: string | number): void {
    const parsed = Number(value);
    this.pageSize = this.pageSizeOptions.includes(parsed) ? parsed : 10;
    this.page = 1;
  }

  clearFilters(): void {
    this.query = '';
    this.filtroTipo = 'todos';
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';
    this.filtroResponsable = '';
    this.applyFilters();
  }

  movimientoLabel(tipo?: string): string {
    const map: Record<string, string> = {
      entrada_compra: 'Entrada compra',
      anulacion_compra: 'Anulación compra',
      decomiso: 'Decomiso',
      averia: 'Avería',
      vencimiento: 'Vencimiento',
      uso_interno: 'Uso interno',
      robo: 'Robo',
      perdida: 'Pérdida',
      merma: 'Merma',
      ajuste_fisico: 'Ajuste físico',
      salida_venta: 'Salida venta',
      entrada: 'Entrada',
      salida: 'Salida',
    };
    return map[tipo || ''] || 'Movimiento';
  }

  get totalMovimientos(): number {
    return this.movimientosFiltrados.length;
  }

  get entradasRegistradas(): number {
    return this.movimientosFiltrados.filter((m) => this.getTipoGrupo(m) === 'entrada').length;
  }

  get salidasRegistradas(): number {
    return this.movimientosFiltrados.filter((m) => this.getTipoGrupo(m) === 'salida').length;
  }

  get ajustesRealizados(): number {
    return this.movimientosFiltrados.filter((m) => this.getTipoGrupo(m) === 'ajuste').length;
  }

  get productosImpactados(): number {
    return new Set(this.movimientosFiltrados.map((m) => m.productoId || m.insumoId || m.productoNombre || m.insumoNombre)).size;
  }

  get valorTotalEntradas(): number {
    return this.movimientosFiltrados
      .filter((m) => this.getTipoGrupo(m) === 'entrada')
      .reduce((acc, m) => acc + this.getValorTotal(m), 0);
  }

  get valorTotalSalidas(): number {
    return this.movimientosFiltrados
      .filter((m) => this.getTipoGrupo(m) === 'salida')
      .reduce((acc, m) => acc + this.getValorTotal(m), 0);
  }

  get balanceNetoInventario(): number {
    return this.valorTotalEntradas - this.valorTotalSalidas;
  }

  get movimientosMes(): number {
    const now = new Date();
    return this.movimientosFiltrados.filter((m) => {
      const d = this.parseDate(m.fecha);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }

  get ultimoMovimiento(): string {
    if (!this.movimientosFiltrados.length) return '—';
    return this.formatDate(this.movimientosFiltrados[0].fecha, true);
  }

  get hasInsights(): boolean {
    return this.insights.length > 0;
  }

  getTipoValue(m: MovimientoInventario): string {
    return String(m.tipoMovimiento || m.tipo || '');
  }

  getTipoGrupo(m: MovimientoInventario): 'entrada' | 'salida' | 'ajuste' | 'devolucion' {
    const tipo = this.getTipoValue(m);
    if (['entrada', 'entrada_compra', 'devolucion'].includes(tipo)) return 'entrada';
    if (['salida', 'salida_venta', 'anulacion_compra', 'decomiso', 'averia', 'vencimiento', 'uso_interno', 'robo', 'perdida', 'merma'].includes(tipo)) return 'salida';
    if (tipo === 'ajuste_fisico') return 'ajuste';
    return 'devolucion';
  }

  getTipoChipColor(m: MovimientoInventario): 'success' | 'danger' | 'warning' | 'tertiary' {
    const type = this.getTipoGrupo(m);
    if (type === 'entrada') return 'success';
    if (type === 'salida') return 'danger';
    if (type === 'ajuste') return 'warning';
    return 'tertiary';
  }

  getValorTotal(m: MovimientoInventario): number {
    const costoTotal = this.toNumber(m.costoTotal);
    if (costoTotal > 0) return costoTotal;
    return this.toNumber(m.cantidad) * this.toNumber(m.costoUnitario);
  }

  getResponsableNombre(m: MovimientoInventario): string {
    const uid = String(m.creadoPor || '').trim();
    if (!uid) return '—';
    const user = this.usuarios.find((u) => String(u.id || '').trim() === uid);
    return String(user?.displayName || user?.nombre || uid);
  }

  formatMoney(value: unknown): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
  }

  formatDate(value: unknown, withTime = false): string {
    const date = this.parseDate(value);
    if (Number.isNaN(date.getTime())) return '—';
    return withTime ? date.toLocaleString('es-DO') : date.toLocaleDateString('es-DO');
  }

  private refreshChartsIfReady(): void {
    if (!this.viewReady || !this.tipoChartCanvas || !this.tendenciaChartCanvas) return;
    this.renderTipoChart();
    this.renderTendenciaChart();
  }

  private renderTipoChart(): void {
    const canvas = this.tipoChartCanvas?.nativeElement;
    if (!canvas) return;
    this.tipoChart?.destroy();
    const entrada = this.entradasRegistradas;
    const salida = this.salidasRegistradas;
    const ajuste = this.ajustesRealizados;
    const devolucion = this.movimientosFiltrados.filter((m) => this.getTipoGrupo(m) === 'devolucion').length;
    const isDark = this.themeService.theme === 'dark';
    this.tipoChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Entradas', 'Salidas', 'Ajustes', 'Devoluciones'],
        datasets: [{
          data: [entrada, salida, ajuste, devolucion],
          backgroundColor: ['#34D399', '#F87171', '#FBBF24', '#38BDF8'],
          borderColor: isDark ? '#334155' : '#ffffff',
          borderWidth: 1.4,
          hoverOffset: 8,
        }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: isDark ? '#E5EDFF' : '#344054', boxWidth: 14 },
          },
        },
      },
    });
  }

  private renderTendenciaChart(): void {
    const canvas = this.tendenciaChartCanvas?.nativeElement;
    if (!canvas) return;
    this.tendenciaChart?.destroy();

    const group = new Map<string, number>();
    for (const m of this.movimientosFiltrados) {
      const d = this.parseDate(m.fecha);
      const key = Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO');
      group.set(key, (group.get(key) || 0) + 1);
    }
    const labels = Array.from(group.keys()).slice(-10);
    const values = labels.map((label) => group.get(label) || 0);
    const isDark = this.themeService.theme === 'dark';
    const axisColor = isDark ? '#C9D7EE' : '#667085';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)';

    this.tendenciaChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Movimientos',
          data: values,
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderColor: '#3B82F6',
          borderWidth: 1,
          borderRadius: 8,
        }],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: axisColor }, grid: { color: gridColor } },
          y: { ticks: { color: axisColor }, grid: { color: gridColor } },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  private buildInsights(): void {
    const list: InsightItem[] = [];
    const salidasSemana = this.movimientosFiltrados.filter((m) => {
      if (this.getTipoGrupo(m) !== 'salida') return false;
      const d = this.parseDate(m.fecha).getTime();
      return d >= (Date.now() - (7 * 24 * 60 * 60 * 1000));
    }).length;
    if (salidasSemana >= 10) {
      list.push({ title: 'Alta cantidad de salidas', detail: `${salidasSemana} salidas registradas en los últimos 7 días.`, level: 'warning' });
    }

    const sinReferencia = this.movimientosFiltrados.filter((m) => !m.referenciaId && !m.referenciaTipo).length;
    if (sinReferencia > 0) {
      list.push({ title: 'Movimientos sin referencia', detail: `${sinReferencia} movimiento(s) sin documento de respaldo.`, level: 'info' });
    }

    const ajustes = this.ajustesRealizados;
    if (ajustes > 0) {
      list.push({ title: 'Ajustes físicos detectados', detail: `${ajustes} ajuste(s) aplicados en el periodo filtrado.`, level: 'info' });
    }

    if (list.length === 0) {
      list.push({ title: 'Operación estable', detail: 'No se detectan inconsistencias críticas en los movimientos.', level: 'ok' });
    }

    this.insights = list;
  }

  private setDefaultMonthDateRange(): void {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    this.filtroFechaDesde = this.toDateInputValue(new Date(year, month, 1));
    this.filtroFechaHasta = this.toDateInputValue(new Date(year, month + 1, 0));
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDate(value: unknown): Date {
    if (value && typeof value === 'object' && 'toDate' in (value as object) && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    return new Date(String(value || ''));
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
