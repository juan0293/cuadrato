import { Component } from '@angular/core';
import { AlertController, LoadingController } from '@ionic/angular';
import { Observable, combineLatest, map } from 'rxjs';
import * as XLSX from 'xlsx';
import { formatCurrencyDOP } from '../../../core/utils/currency.utils';
import { agruparPorCategoria } from '../helpers/finanzas.helper';
import { MovimientoFinanciero } from '../models/movimiento-financiero.model';
import { FinanzasService } from '../services/finanzas.service';
import { totalGastos } from '../utils/finance-calculation.utils';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { UsuarioModel } from '../../usuarios/models/usuario.model';
import { CuentasPorPagarService } from '../../inventario/services/cuentas-por-pagar.service';
import { CuentaPorPagar } from '../../inventario/models/cuenta-por-pagar.model';
import { CuentasPorCobrarService } from '../../facturacion/services/cuentas-por-cobrar.service';
import { CuentaPorCobrar } from '../../facturacion/models/cuenta-por-cobrar.model';
import { TurnoCaja, TurnoTotales } from '../../facturacion/models/turno-caja.model';
import { TurnosCajaService } from '../../facturacion/services/turnos-caja.service';
import { FacturacionService } from '../../facturacion/services/facturacion.service';
import { Factura } from '../../facturacion/models/factura.model';
import { FinanzasTheme, FinanzasThemeService } from '../services/finanzas-theme.service';

interface FinanzasViewModel {
  movimientos: MovimientoFinanciero[];
  ingresos: number;
  gastos: number;
  balance: number;
  rentabilidad: number;
  ventasFacturadas: number;
  otrosIngresos: number;
  promedioMovimiento: number;
  totalMovimientos: number;
  topCategoriaGasto: string;
  ultimoMovimiento?: MovimientoFinanciero;
  gastosCategoriaChart: { labels: string[]; values: number[] };
  ingresosArtistaChart: { labels: string[]; values: number[] };
  recientes: MovimientoFinanciero[];
  cxp: {
    totalPorPagar: number;
    facturasPendientes: number;
    facturasVencidas: number;
    pagadoEsteMes: number;
    proximasAVencer: number;
    proveedorMayorDeuda: string;
    porcentajePagado: number;
  };
  cxc: {
    totalPorCobrar: number;
    cuentasPendientes: number;
    cuentasVencidas: number;
    cobradoEsteMes: number;
    proximasAVencer: number;
    clienteMayorDeuda: string;
    porcentajeCobrado: number;
  };
  turnos: {
    ventasFiltradas: number;
    abiertos: number;
    cerrados: number;
    efectivoEsperado: number;
    efectivoContado: number;
    diferenciaTotal: number;
    totalEfectivo: number;
    totalTarjeta: number;
    totalTransferencia: number;
    totalCredito: number;
    cantidadFacturas: number;
    cajaMayorVentas: string;
    usuarioMayorVentas: string;
  };
  turnosRaw: TurnoCaja[];
  facturasRaw: Factura[];
}

@Component({
  standalone: false,
  selector: 'app-finanzas',
  templateUrl: './finanzas.page.html',
  styleUrls: ['./finanzas.page.scss'],
})
export class FinanzasPage {
  financeTheme: FinanzasTheme;
  private readonly rangoInicial = this.getMesActualRango();
  fechaDesde = this.rangoInicial.desde;
  fechaHasta = this.rangoInicial.hasta;
  latestRecientes: MovimientoFinanciero[] = [];
  recientesPage = 1;
  recientesPageSize = 10;
  readonly recientesPageSizeOptions = [5, 10, 20, 50];
  turnoSearch = '';
  turnoEstado: 'todos' | 'abierto' | 'cerrado' = 'todos';
  turnoFechaDesde = this.rangoInicial.desde;
  turnoFechaHasta = this.rangoInicial.hasta;
  turnoCaja = '';
  turnoUsuario = '';
  turnoPage = 1;
  turnoPageSize = 10;
  readonly turnoPageSizeOptions = [5, 10, 20, 50];
  selectedTurno: TurnoCaja | null = null;
  turnoDetalleOpen = false;
  turnoFacturasOpen = false;
  turnoFacturasSeleccionadas: Factura[] = [];
  vm$: Observable<FinanzasViewModel> = this.buildViewModel(
    this.finanzasService.byRango(this.fechaDesde, this.fechaHasta),
    this.usuariosService.list(),
    this.cuentasPorPagarService.listEnriquecida(),
    this.cuentasPorCobrarService.listEnriquecida(),
    this.turnosCajaService.list(),
    this.facturacionService.getFacturas(),
  );

  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly usuariosService: UsuariosService,
    private readonly cuentasPorPagarService: CuentasPorPagarService,
    private readonly cuentasPorCobrarService: CuentasPorCobrarService,
    private readonly turnosCajaService: TurnosCajaService,
    private readonly facturacionService: FacturacionService,
    private readonly alertCtrl: AlertController,
    private readonly loadingCtrl: LoadingController,
    private readonly finanzasThemeService: FinanzasThemeService,
  ) {
    this.financeTheme = this.finanzasThemeService.theme;
  }

  toggleFinanceTheme(): void {
    this.financeTheme = this.finanzasThemeService.toggle();
  }

  onFechaDesdeChange(value: string | null | undefined): void {
    this.fechaDesde = String(value || '');
    if (this.fechaDesde && this.fechaHasta && this.fechaDesde > this.fechaHasta) {
      this.fechaHasta = this.fechaDesde;
    }
    this.refreshViewModel();
  }

  onFechaHastaChange(value: string | null | undefined): void {
    this.fechaHasta = String(value || '');
    if (this.fechaDesde && this.fechaHasta && this.fechaHasta < this.fechaDesde) {
      this.fechaDesde = this.fechaHasta;
    }
    this.refreshViewModel();
  }

  mostrarMesActual(): void {
    const rango = this.getMesActualRango();
    this.fechaDesde = rango.desde;
    this.fechaHasta = rango.hasta;
    this.refreshViewModel();
  }

  private refreshViewModel(): void {
    this.recientesPage = 1;
    this.vm$ = this.buildViewModel(
      this.finanzasService.byRango(this.fechaDesde, this.fechaHasta),
      this.usuariosService.list(),
      this.cuentasPorPagarService.listEnriquecida(),
      this.cuentasPorCobrarService.listEnriquecida(),
      this.turnosCajaService.list(),
      this.facturacionService.getFacturas(),
    );
  }

  formatCurrency = formatCurrencyDOP;

  getPeriodoTitulo(): string {
    return 'del rango';
  }

  getRangoTitulo(): string {
    if (!this.fechaDesde && !this.fechaHasta) return 'Todos los registros';
    const formatter = new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
    const desde = this.fechaDesde ? this.parseDateSafe(`${this.fechaDesde}T00:00:00`) : null;
    const hasta = this.fechaHasta ? this.parseDateSafe(`${this.fechaHasta}T00:00:00`) : null;
    if (desde && hasta) return `${formatter.format(desde)} – ${formatter.format(hasta)}`;
    if (desde) return `Desde ${formatter.format(desde)}`;
    return hasta ? `Hasta ${formatter.format(hasta)}` : 'Todos los registros';
  }

  getTipoBadgeClass(tipo: MovimientoFinanciero['tipo']): string {
    return tipo === 'ingreso' ? 'mov-badge mov-badge--ingreso' : 'mov-badge mov-badge--gasto';
  }

  getTipoLabel(tipo: MovimientoFinanciero['tipo']): string {
    return tipo === 'ingreso' ? 'Ingreso' : 'Gasto';
  }

  exportarExcelMovimientos(): void {
    const rows = this.latestRecientes.map((mov) => ({
      Fecha: mov.fecha,
      Tipo: this.getTipoLabel(mov.tipo),
      Categoria: mov.categoria || 'Sin categoria',
      Descripcion: mov.descripcion || 'Sin descripcion',
      Monto: this.toNumber(mov.monto),
      Evidencias: (mov.evidencias || []).length,
      EvidenciasUrls: (mov.evidencias || []).map((e) => e.url).join(' | '),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MovimientosRecientes');
    XLSX.writeFile(workbook, `movimientos-recientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  exportarExcelTurnos(vm: FinanzasViewModel): void {
    const rows = this.getTurnosFiltrados(vm).map((t) => ({
      NumeroTurno: t.numeroTurno || '—',
      Caja: t.cajaNombre || 'Sin caja',
      Usuario: t.usuarioNombre || 'Sin usuario',
      Apertura: this.formatDate(t.fechaApertura),
      Cierre: this.formatDate(t.fechaCierre),
      Estado: this.getTurnoEstadoLabel(t.estado),
      TotalVentas: this.toNumberSafe(t.totalVentas),
      EfectivoEsperado: this.toNumberSafe(t.efectivoEsperado),
      EfectivoContado: this.toNumberSafe(t.efectivoContado),
      Diferencia: this.toNumberSafe(t.diferencia),
      CantidadFacturas: this.toNumberSafe(t.cantidadFacturas),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TurnosCaja');
    XLSX.writeFile(workbook, `turnos-caja-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  puedeVerEvidencias(mov: MovimientoFinanciero): boolean {
    return mov.tipo === 'gasto' && (mov.evidencias || []).length > 0;
  }

  async verEvidencias(mov: MovimientoFinanciero): Promise<void> {
    const evidencias = mov.evidencias || [];
    if (!evidencias.length) return;

    const buttons: Array<{ text: string; role?: 'cancel'; handler?: () => void }> = evidencias.slice(0, 5).map((ev, idx) => ({
      text: `Abrir ${idx + 1}: ${ev.nombre}`,
      handler: () => {
        window.open(ev.url, '_blank', 'noopener');
      },
    }));
    buttons.push({ text: 'Cerrar', role: 'cancel' });

    const alert = await this.alertCtrl.create({
      header: 'Evidencias del gasto',
      message: `Se encontraron ${evidencias.length} archivo(s) adjunto(s).`,
      buttons,
    });
    await alert.present();
  }

  private buildViewModel(
    source$: Observable<MovimientoFinanciero[]>,
    usuarios$: Observable<UsuarioModel[]>,
    cuentasPorPagar$: Observable<CuentaPorPagar[]>,
    cuentasPorCobrar$: Observable<CuentaPorCobrar[]>,
    turnos$: Observable<TurnoCaja[]>,
    facturas$: Observable<Factura[]>,
  ): Observable<FinanzasViewModel> {
    return combineLatest([source$, usuarios$, cuentasPorPagar$, cuentasPorCobrar$, turnos$, facturas$]).pipe(
      map(([items, usuarios, cuentasPorPagar, cuentasPorCobrar, turnos, facturas]) => {
        const facturasPeriodo = this.filtrarFacturasContablesPorRango(facturas || []);
        const turnosEnriquecidos = this.enriquecerTurnosConFacturas(turnos || [], facturas || []);
        const actividadReciente = this.buildActividadReciente(items, facturasPeriodo);
        const ventasFacturadas = this.calcularVentasFacturadas(facturasPeriodo);
        const otrosIngresos = this.calcularOtrosIngresos(items);
        const ingresos = Number((ventasFacturadas + otrosIngresos).toFixed(2));
        const gastos = totalGastos(items);
        const balance = Number((ingresos - gastos).toFixed(2));
        const cxp = this.calcularKpisCuentasPorPagar(cuentasPorPagar || []);
        const cxc = this.calcularKpisCuentasPorCobrar(cuentasPorCobrar || []);
        const turnosKpis = this.calcularKpisTurnos(turnosEnriquecidos);

        const groupedGastos = agruparPorCategoria(items.filter((item) => item.tipo === 'gasto'));
        const groupedIngresos = this.agruparIngresosPorNombreArtista(items.filter((item) => item.tipo === 'ingreso'), facturasPeriodo, usuarios || []);
        const totalRegistrosOperativos = this.calcularTotalRegistrosOperativos(items, facturasPeriodo);

        const topCategoria = Object.entries(groupedGastos).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Sin datos';

        return {
          movimientos: items,
          ingresos,
          gastos,
          balance,
          rentabilidad: this.calcularRentabilidad(ingresos, gastos),
          ventasFacturadas,
          otrosIngresos,
          promedioMovimiento: totalRegistrosOperativos ? Number(((ingresos + gastos) / totalRegistrosOperativos).toFixed(2)) : 0,
          totalMovimientos: totalRegistrosOperativos,
          topCategoriaGasto: topCategoria,
          ultimoMovimiento: actividadReciente[0],
          gastosCategoriaChart: { labels: Object.keys(groupedGastos), values: Object.values(groupedGastos) },
          ingresosArtistaChart: { labels: Object.keys(groupedIngresos), values: Object.values(groupedIngresos) },
          recientes: actividadReciente,
          cxp,
          cxc,
          turnos: turnosKpis,
          turnosRaw: turnosEnriquecidos,
          facturasRaw: facturas || [],
        };
      }),
      map((vm) => {
        this.latestRecientes = vm.recientes;
        const totalPages = this.getRecientesTotalPages(vm);
        if (this.recientesPage > totalPages) this.recientesPage = totalPages;
        if (this.recientesPage < 1) this.recientesPage = 1;
        return vm;
      }),
    );
  }

  getRecientesPaginados(vm: FinanzasViewModel): MovimientoFinanciero[] {
    const totalPages = this.getRecientesTotalPages(vm);
    if (this.recientesPage > totalPages) this.recientesPage = totalPages;
    if (this.recientesPage < 1) this.recientesPage = 1;
    const start = (this.recientesPage - 1) * this.recientesPageSize;
    return (vm.recientes || []).slice(start, start + this.recientesPageSize);
  }

  getRecientesTotalPages(vm: FinanzasViewModel): number {
    const total = (vm.recientes || []).length;
    return Math.max(1, Math.ceil(total / this.recientesPageSize));
  }

  onRecientesPageSizeChange(value: string | number | undefined): void {
    const parsed = Number(value);
    this.recientesPageSize = this.recientesPageSizeOptions.includes(parsed) ? parsed : 10;
    this.recientesPage = 1;
  }

  goToRecientesPage(page: number, vm: FinanzasViewModel): void {
    const totalPages = this.getRecientesTotalPages(vm);
    this.recientesPage = Math.min(totalPages, Math.max(1, page));
  }

  getTurnosFiltrados(vm: FinanzasViewModel): TurnoCaja[] {
    const q = this.normalize(this.turnoSearch);
    const caja = this.normalize(this.turnoCaja);
    const usuario = this.normalize(this.turnoUsuario);
    const from = this.turnoFechaDesde ? new Date(`${this.turnoFechaDesde}T00:00:00`) : null;
    const to = this.turnoFechaHasta ? new Date(`${this.turnoFechaHasta}T23:59:59`) : null;

    return (vm.turnosRaw || []).filter((t) => {
      if (this.turnoEstado !== 'todos' && t.estado !== this.turnoEstado) return false;
      const text = this.normalize(`${t.numeroTurno} ${t.cajaNombre} ${t.usuarioNombre}`);
      if (q && !text.includes(q)) return false;
      if (caja && !this.normalize(t.cajaNombre).includes(caja)) return false;
      if (usuario && !this.normalize(t.usuarioNombre).includes(usuario)) return false;
      const fecha = this.parseDateSafe(t.fechaApertura || t.createdAt);
      if (from && (!fecha || fecha < from)) return false;
      if (to && (!fecha || fecha > to)) return false;
      return true;
    }).sort((a, b) =>
      (this.parseDateSafe(b.fechaApertura || b.createdAt)?.getTime() || 0)
      - (this.parseDateSafe(a.fechaApertura || a.createdAt)?.getTime() || 0));
  }

  getTurnosResumen(vm: FinanzasViewModel): FinanzasViewModel['turnos'] {
    return this.calcularKpisTurnos(this.getTurnosFiltrados(vm));
  }

  getTurnosPaginados(vm: FinanzasViewModel): TurnoCaja[] {
    const filtered = this.getTurnosFiltrados(vm);
    const totalPages = this.getTurnoTotalPages(vm);
    if (this.turnoPage > totalPages) this.turnoPage = totalPages;
    if (this.turnoPage < 1) this.turnoPage = 1;
    const start = (this.turnoPage - 1) * this.turnoPageSize;
    return filtered.slice(start, start + this.turnoPageSize);
  }

  getTurnoTotalPages(vm: FinanzasViewModel): number {
    const total = this.getTurnosFiltrados(vm).length;
    return Math.max(1, Math.ceil(total / this.turnoPageSize));
  }

  onTurnoPageSizeChange(value: string | number | undefined): void {
    const parsed = Number(value);
    this.turnoPageSize = this.turnoPageSizeOptions.includes(parsed) ? parsed : 10;
    this.turnoPage = 1;
  }

  goToTurnoPage(page: number, vm: FinanzasViewModel): void {
    const totalPages = this.getTurnoTotalPages(vm);
    this.turnoPage = Math.min(totalPages, Math.max(1, page));
  }

  onTurnoSearchChange(value: string | null | undefined): void {
    this.turnoSearch = String(value || '');
    this.turnoPage = 1;
  }

  onTurnoEstadoChange(value: 'todos' | 'abierto' | 'cerrado' | null | undefined): void {
    this.turnoEstado = (value || 'todos') as 'todos' | 'abierto' | 'cerrado';
    this.turnoPage = 1;
  }

  onTurnoFechaDesdeChange(value: string | null | undefined): void {
    this.turnoFechaDesde = String(value || '');
    this.turnoPage = 1;
  }

  onTurnoFechaHastaChange(value: string | null | undefined): void {
    this.turnoFechaHasta = String(value || '');
    this.turnoPage = 1;
  }

  get hasTurnoFilters(): boolean {
    return Boolean(this.turnoSearch.trim() || this.turnoEstado !== 'todos' || this.turnoFechaDesde || this.turnoFechaHasta);
  }

  clearTurnoFilters(): void {
    this.turnoSearch = '';
    this.turnoEstado = 'todos';
    this.turnoFechaDesde = '';
    this.turnoFechaHasta = '';
    this.turnoPage = 1;
  }

  getTurnoEstadoLabel(estado: TurnoCaja['estado']): string {
    return estado === 'abierto' ? 'Abierto' : 'Cerrado';
  }

  getTurnoEstadoClass(estado: TurnoCaja['estado']): string {
    return estado === 'abierto' ? 'mov-badge mov-badge--ajuste' : 'mov-badge mov-badge--ingreso';
  }

  getDiferenciaLabel(diferencia: unknown): string {
    const value = this.toNumberSafe(diferencia);
    if (value > 0) return 'Sobrante de caja';
    if (value < 0) return 'Faltante de caja';
    return 'Caja cuadrada';
  }

  getDiferenciaClass(diferencia: unknown): string {
    const value = this.toNumberSafe(diferencia);
    if (value > 0) return 'is-success';
    if (value < 0) return 'is-danger';
    return '';
  }

  getEstadoPagoFacturaClass(estadoPago: string | undefined): string {
    const estado = String(estadoPago || '').toLowerCase();
    if (estado === 'pagada') return 'mov-badge mov-badge--ingreso';
    if (estado === 'parcial') return 'mov-badge mov-badge--ajuste';
    if (estado === 'credito' || estado === 'pendiente') return 'mov-badge mov-badge--gasto';
    return 'mov-badge';
  }

  getEstadoFacturaClass(estado: string | undefined): string {
    const value = String(estado || '').toLowerCase();
    return value === 'emitida' ? 'mov-badge mov-badge--ingreso' : 'mov-badge mov-badge--ajuste';
  }

  formatDate(value: any): string {
    const parsed = this.parseDateSafe(value);
    if (!parsed) return '--';
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  }

  toNumberSafe(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  isToday(value: any): boolean {
    const d = this.parseDateSafe(value);
    if (!d) return false;
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  abrirDetalleTurno(turno: TurnoCaja): void {
    this.selectedTurno = turno;
    this.turnoDetalleOpen = true;
  }

  cerrarDetalleTurno(): void {
    this.turnoDetalleOpen = false;
    this.selectedTurno = null;
  }

  verFacturasTurno(turno: TurnoCaja, vm: FinanzasViewModel): void {
    this.selectedTurno = turno;
    this.turnoFacturasSeleccionadas = (vm.facturasRaw || [])
      .filter((f) => String(f.turnoId || '') === String(turno.id || ''))
      .sort((a, b) => this.parseFecha(b.fecha || b.creadoEn) - this.parseFecha(a.fecha || a.creadoEn));
    this.turnoFacturasOpen = true;
  }

  cerrarFacturasTurno(): void {
    this.turnoFacturasOpen = false;
    this.turnoFacturasSeleccionadas = [];
  }

  async cerrarTurnoDesdeFinanzas(turno: TurnoCaja): Promise<void> {
    if (turno.estado !== 'abierto' || !turno.id) return;
    if (!navigator.onLine) {
      const alert = await this.alertCtrl.create({
        header: 'Sin conexión a internet',
        message: 'Necesitas conexión para sincronizar el cierre de turno.',
        buttons: ['Entendido'],
      });
      await alert.present();
      return;
    }

    const prompt = await this.alertCtrl.create({
      header: 'Cerrar turno',
      message: 'Registra el efectivo contado para cerrar el turno.',
      inputs: [
        { name: 'efectivoContado', type: 'number', placeholder: 'Efectivo contado' },
        { name: 'observacionCierre', type: 'text', placeholder: 'Observación de cierre (opcional)' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cerrar turno',
          handler: async (data) => {
            const efectivoContado = this.toNumberSafe(data.efectivoContado);
            const loading = await this.loadingCtrl.create({ message: 'Cerrando turno…' });
            await loading.present();
            try {
              await this.turnosCajaService.cerrarTurno(turno, efectivoContado, String(data.observacionCierre || ''));
            } catch (error) {
              console.error('[Finanzas] cerrarTurnoDesdeFinanzas error', error);
              const fail = await this.alertCtrl.create({ header: 'Error', message: 'No pudimos cerrar el turno', buttons: ['Entendido'] });
              await fail.present();
            } finally {
              await loading.dismiss();
            }
          },
        },
      ],
    });
    await prompt.present();
  }

  parseDateSafe(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof (value as any)?.toDate === 'function') {
      const d = (value as any).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const raw = String(value).trim();
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  isOverdue(fechaVencimiento: unknown, balancePendiente: unknown): boolean {
    const fecha = this.parseDateSafe(fechaVencimiento);
    if (!fecha) return false;
    return fecha.getTime() < Date.now() && this.toNumber(balancePendiente) > 0;
  }

  isDueSoon(fechaVencimiento: unknown, balancePendiente: unknown): boolean {
    const fecha = this.parseDateSafe(fechaVencimiento);
    if (!fecha) return false;
    const diff = (fecha.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7 && this.toNumber(balancePendiente) > 0;
  }

  getEstadoCuenta(cuenta: CuentaPorPagar): string {
    if (cuenta.estado === 'anulada') return 'anulada';
    if (this.toNumber(cuenta.balancePendiente) <= 0) return 'pagada';
    if (this.isOverdue(cuenta.fechaVencimiento, cuenta.balancePendiente)) return 'vencida';
    if (this.toNumber(cuenta.montoPagado) > 0) return 'parcial';
    return 'pendiente';
  }

  private agruparIngresosPorNombreArtista(
    items: MovimientoFinanciero[],
    facturas: Factura[],
    usuarios: UsuarioModel[],
  ): Record<string, number> {
    const agrupado: Record<string, number> = {};

    facturas.forEach((factura) => {
      const nombre = String(factura.artistaNombre || this.getUsuarioNombre(factura.artistaId, usuarios) || 'Sin artista');
      agrupado[nombre] = Number(((agrupado[nombre] ?? 0) + this.toNumber(factura.total)).toFixed(2));
    });

    items
      .filter((item) => item.tipo === 'ingreso' && !!item.artistaId && !this.isIngresoFacturacion(item))
      .forEach((item) => {
        const nombre = this.getUsuarioNombre(item.artistaId, usuarios);
        agrupado[nombre] = Number(((agrupado[nombre] ?? 0) + this.toNumber(item.monto)).toFixed(2));
      });

    return agrupado;
  }

  private getUsuarioNombre(uid: string | undefined, usuarios: UsuarioModel[]): string {
    const id = String(uid || '').trim();
    if (!id) return 'Sin artista';
    const user = usuarios.find((u) => String(u.id || '') === id);
    return String(user?.displayName || user?.nombre || id);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private calcularOtrosIngresos(items: MovimientoFinanciero[]): number {
    return Number(items
      .filter((item) => item.tipo === 'ingreso' && !this.isIngresoFacturacion(item))
      .reduce((acc, item) => acc + this.toNumber(item.monto), 0)
      .toFixed(2));
  }

  private calcularVentasFacturadas(facturas: Factura[]): number {
    return Number(facturas.reduce((acc, factura) => acc + this.toNumber(factura.total), 0).toFixed(2));
  }

  private calcularRentabilidad(ingresos: number, gastos: number): number {
    if (gastos <= 0) return ingresos > 0 ? 100 : 0;
    return Number((((ingresos - gastos) / gastos) * 100).toFixed(2));
  }

  private calcularTotalRegistrosOperativos(items: MovimientoFinanciero[], facturas: Factura[]): number {
    const movimientosOperativos = items.filter((item) => item.tipo === 'gasto' || !this.isIngresoFacturacion(item)).length;
    return movimientosOperativos + facturas.length;
  }

  private buildActividadReciente(items: MovimientoFinanciero[], facturas: Factura[]): MovimientoFinanciero[] {
    const movimientosOperativos = items
      .filter((item) => !this.isIngresoFacturacion(item))
      .map((item) => ({
        ...item,
        categoria: item.categoria || (item.tipo === 'gasto' ? 'Gasto operativo' : 'Ingreso operativo'),
        descripcion: item.descripcion || (item.tipo === 'gasto' ? 'Gasto registrado manualmente' : 'Ingreso registrado manualmente'),
      }));

    const facturasComoMovimientos = facturas.map((factura) => this.mapFacturaToActividad(factura));

    return [...movimientosOperativos, ...facturasComoMovimientos]
      .sort((a, b) => this.parseFecha(b.fecha) - this.parseFecha(a.fecha));
  }

  private isIngresoFacturacion(item: MovimientoFinanciero): boolean {
    const categoria = this.normalize(item.categoria);
    return item.tipo === 'ingreso' && (!!item.facturaId || categoria === 'facturacion');
  }

  private mapFacturaToActividad(factura: Factura): MovimientoFinanciero {
    const metodoPago = this.getFacturaMetodoPagoLabel(factura);
    const numeroFactura = String(factura.numero || factura.numeroFactura || 'Sin numero');
    const cliente = String(factura.clienteNombre || 'Consumidor final');
    return {
      tipo: 'ingreso',
      categoria: `Venta ${metodoPago}`,
      monto: this.toNumber(factura.total),
      descripcion: `Factura ${numeroFactura} · ${cliente}`,
      artistaId: factura.artistaId,
      citaId: factura.citaId,
      facturaId: factura.id,
      fecha: String(factura.fecha || factura.creadoEn || ''),
      creadoPor: String(factura.creadaPor || ''),
    };
  }

  private getFacturaMetodoPagoLabel(factura: Factura): string {
    const pagos = factura.pagos;
    if (pagos) {
      if (this.toNumber(pagos.credito ?? pagos.totalCredito) > 0) return 'credito';
      if (
        this.toNumber(pagos.efectivo) > 0 &&
        (this.toNumber(pagos.tarjeta) > 0 || this.toNumber(pagos.transferencia) > 0)
      ) return 'mixta';
      if (this.toNumber(pagos.efectivo) > 0) return 'efectivo';
      if (this.toNumber(pagos.tarjeta) > 0) return 'tarjeta';
      if (this.toNumber(pagos.transferencia) > 0) return 'transferencia';
    }
    return String(factura.formaPago || 'general');
  }

  private esFacturaContable(factura: Factura): boolean {
    return ['emitida', 'pagada'].includes(String(factura.estado || '').toLowerCase()) && String(factura.estado || '').toLowerCase() !== 'anulada';
  }

  private filtrarFacturasContablesPorRango(facturas: Factura[]): Factura[] {
    const desde = this.fechaDesde ? this.parseDateSafe(`${this.fechaDesde}T00:00:00`) : null;
    const hasta = this.fechaHasta ? this.parseDateSafe(`${this.fechaHasta}T23:59:59.999`) : null;
    return facturas.filter((factura) => {
      if (!this.esFacturaContable(factura)) return false;
      const fecha = this.parseDateSafe(factura.fecha || factura.creadoEn);
      if (!fecha) return false;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }

  private enriquecerTurnosConFacturas(turnos: TurnoCaja[], facturas: Factura[]): TurnoCaja[] {
    const totalesPorTurno = new Map<string, TurnoTotales>();

    facturas
      .filter((factura) => this.esFacturaContable(factura) && !!factura.turnoId)
      .forEach((factura) => {
        const turnoId = String(factura.turnoId || '');
        const acumulado = totalesPorTurno.get(turnoId) || this.createEmptyTurnoTotales();
        const pagos = this.getFacturaPaymentBreakdown(factura);
        acumulado.totalVentas = Number((acumulado.totalVentas + this.toNumber(factura.total)).toFixed(2));
        acumulado.totalEfectivo = Number((acumulado.totalEfectivo + pagos.efectivo).toFixed(2));
        acumulado.totalTarjeta = Number((acumulado.totalTarjeta + pagos.tarjeta).toFixed(2));
        acumulado.totalTransferencia = Number((acumulado.totalTransferencia + pagos.transferencia).toFixed(2));
        acumulado.totalCredito = Number((acumulado.totalCredito + pagos.credito).toFixed(2));
        acumulado.cantidadFacturas += 1;
        totalesPorTurno.set(turnoId, acumulado);
      });

    return turnos.map((turno) => {
      const totales = totalesPorTurno.get(String(turno.id || '')) || this.createEmptyTurnoTotales();
      const montoInicial = this.toNumberSafe(turno.montoInicial);
      const efectivoEsperado = Number((montoInicial + totales.totalEfectivo).toFixed(2));
      const efectivoContado = turno.estado === 'cerrado' ? this.toNumberSafe(turno.efectivoContado) : null;
      const diferencia = turno.estado === 'cerrado' && efectivoContado !== null
        ? Number((efectivoContado - efectivoEsperado).toFixed(2))
        : this.toNumberSafe(turno.diferencia);

      return {
        ...turno,
        totalVentas: totales.totalVentas,
        totalEfectivo: totales.totalEfectivo,
        totalTarjeta: totales.totalTarjeta,
        totalTransferencia: totales.totalTransferencia,
        totalCredito: totales.totalCredito,
        cantidadFacturas: totales.cantidadFacturas,
        efectivoEsperado,
        efectivoContado,
        diferencia,
      };
    });
  }

  private getFacturaPaymentBreakdown(factura: Factura): { efectivo: number; tarjeta: number; transferencia: number; credito: number } {
    const pagos = factura.pagos;
    if (pagos) {
      return {
        efectivo: this.toNumber(pagos.efectivo),
        tarjeta: this.toNumber(pagos.tarjeta),
        transferencia: this.toNumber(pagos.transferencia),
        credito: this.toNumber(pagos.credito ?? pagos.totalCredito),
      };
    }

    const total = this.toNumber(factura.total);
    const formaPago = this.normalize(factura.formaPago);
    return {
      efectivo: formaPago === 'efectivo' ? total : 0,
      tarjeta: formaPago === 'tarjeta' ? total : 0,
      transferencia: formaPago === 'transferencia' ? total : 0,
      credito: formaPago === 'credito' ? total : 0,
    };
  }

  private createEmptyTurnoTotales(): TurnoTotales {
    return {
      totalVentas: 0,
      totalEfectivo: 0,
      totalTarjeta: 0,
      totalTransferencia: 0,
      totalCredito: 0,
      cantidadFacturas: 0,
    };
  }

  private calcularKpisCuentasPorPagar(cuentas: CuentaPorPagar[]): FinanzasViewModel['cxp'] {
    const totalPorPagar = cuentas
      .filter((item) => this.getEstadoCuenta(item) !== 'pagada' && this.getEstadoCuenta(item) !== 'anulada')
      .reduce((acc, item) => acc + this.toNumber(item.balancePendiente), 0);

    const facturasPendientes = cuentas.filter((item) => ['pendiente', 'parcial'].includes(this.getEstadoCuenta(item))).length;
    const facturasVencidas = cuentas.filter((item) => this.isOverdue(item.fechaVencimiento, item.balancePendiente)).length;
    const proximasAVencer = cuentas.filter((item) => this.isDueSoon(item.fechaVencimiento, item.balancePendiente)).length;

    const now = new Date();
    const pagadoEsteMes = cuentas.reduce((acc, item) => {
      const fecha = this.parseDateSafe(item.fechaCreacion);
      if (!fecha) return acc;
      if (fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear()) {
        return acc + this.toNumber(item.montoPagado);
      }
      return acc;
    }, 0);

    const deudaPorProveedor = new Map<string, number>();
    for (const cuenta of cuentas) {
      const proveedor = String(cuenta.proveedorNombre || 'Sin proveedor');
      const deuda = this.toNumber(cuenta.balancePendiente);
      deudaPorProveedor.set(proveedor, (deudaPorProveedor.get(proveedor) || 0) + deuda);
    }

    let proveedorMayorDeuda = 'Sin datos';
    let topDeuda = -1;
    deudaPorProveedor.forEach((value, key) => {
      if (value > topDeuda) {
        topDeuda = value;
        proveedorMayorDeuda = key;
      }
    });

    const montoPagadoTotal = cuentas.reduce((acc, item) => acc + this.toNumber(item.montoPagado), 0);
    const montoOriginalTotal = cuentas.reduce((acc, item) => acc + this.toNumber(item.montoOriginal), 0);
    const porcentajePagado = montoOriginalTotal > 0 ? (montoPagadoTotal / montoOriginalTotal) * 100 : 0;

    return {
      totalPorPagar,
      facturasPendientes,
      facturasVencidas,
      pagadoEsteMes,
      proximasAVencer,
      proveedorMayorDeuda,
      porcentajePagado,
    };
  }

  private calcularKpisCuentasPorCobrar(cuentas: CuentaPorCobrar[]): FinanzasViewModel['cxc'] {
    const totalPorCobrar = cuentas
      .filter((item) => item.estado !== 'pagada' && item.estado !== 'anulada')
      .reduce((acc, item) => acc + this.toNumber(item.balancePendiente), 0);

    const cuentasPendientes = cuentas.filter((item) => ['pendiente', 'parcial'].includes(String(item.estado))).length;
    const cuentasVencidas = cuentas.filter((item) => this.isOverdue(item.fechaVencimiento, item.balancePendiente)).length;
    const proximasAVencer = cuentas.filter((item) => this.isDueSoon(item.fechaVencimiento, item.balancePendiente)).length;

    const now = new Date();
    const cobradoEsteMes = cuentas.reduce((acc, item) => {
      const fecha = this.parseDateSafe(item.updatedAt || item.fechaCreacion);
      if (!fecha) return acc;
      if (fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear()) {
        return acc + this.toNumber(item.montoPagado);
      }
      return acc;
    }, 0);

    const deudaPorCliente = new Map<string, number>();
    for (const cuenta of cuentas) {
      const cliente = String(cuenta.clienteNombre || 'Sin cliente');
      const deuda = this.toNumber(cuenta.balancePendiente);
      deudaPorCliente.set(cliente, (deudaPorCliente.get(cliente) || 0) + deuda);
    }

    let clienteMayorDeuda = 'Sin datos';
    let topDeuda = -1;
    deudaPorCliente.forEach((value, key) => {
      if (value > topDeuda) {
        topDeuda = value;
        clienteMayorDeuda = key;
      }
    });

    const montoCobradoTotal = cuentas.reduce((acc, item) => acc + this.toNumber(item.montoPagado), 0);
    const montoOriginalTotal = cuentas.reduce((acc, item) => acc + this.toNumber(item.montoOriginal), 0);
    const porcentajeCobrado = montoOriginalTotal > 0 ? (montoCobradoTotal / montoOriginalTotal) * 100 : 0;

    return {
      totalPorCobrar,
      cuentasPendientes,
      cuentasVencidas,
      cobradoEsteMes,
      proximasAVencer,
      clienteMayorDeuda,
      porcentajeCobrado,
    };
  }

  private calcularKpisTurnos(turnos: TurnoCaja[]): FinanzasViewModel['turnos'] {
    const ventasFiltradas = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.totalVentas), 0);
    const abiertos = turnos.filter((t) => t.estado === 'abierto').length;
    const cerrados = turnos.filter((t) => t.estado === 'cerrado').length;
    const efectivoEsperado = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.efectivoEsperado), 0);
    const efectivoContado = turnos.filter((t) => t.estado === 'cerrado').reduce((acc, t) => acc + this.toNumberSafe(t.efectivoContado), 0);
    const diferenciaTotal = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.diferencia), 0);
    const totalEfectivo = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.totalEfectivo), 0);
    const totalTarjeta = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.totalTarjeta), 0);
    const totalTransferencia = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.totalTransferencia), 0);
    const totalCredito = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.totalCredito), 0);
    const cantidadFacturas = turnos.reduce((acc, t) => acc + this.toNumberSafe(t.cantidadFacturas), 0);

    const cajaMap = new Map<string, number>();
    const userMap = new Map<string, number>();
    turnos.forEach((t) => {
      cajaMap.set(String(t.cajaNombre || 'Sin caja'), (cajaMap.get(String(t.cajaNombre || 'Sin caja')) || 0) + this.toNumberSafe(t.totalVentas));
      userMap.set(String(t.usuarioNombre || 'Sin usuario'), (userMap.get(String(t.usuarioNombre || 'Sin usuario')) || 0) + this.toNumberSafe(t.totalVentas));
    });
    const cajaMayorVentas = [...cajaMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin datos';
    const usuarioMayorVentas = [...userMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin datos';

    return {
      ventasFiltradas,
      abiertos,
      cerrados,
      efectivoEsperado,
      efectivoContado,
      diferenciaTotal,
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalCredito,
      cantidadFacturas,
      cajaMayorVentas,
      usuarioMayorVentas,
    };
  }

  private normalize(value: unknown): string {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private getMesActualRango(): { desde: string; hasta: string } {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      desde: this.toInputDate(firstDay),
      hasta: this.toInputDate(lastDay),
    };
  }

  private toInputDate(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseFecha(value: string | undefined): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
