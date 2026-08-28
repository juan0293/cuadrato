import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { AuthService } from '../../../../core/services/auth.service';
import { CobroCuentaPorCobrar, CuentaPorCobrar, EstadoCuentaPorCobrar } from '../../models/cuenta-por-cobrar.model';
import { CuentasPorCobrarService } from '../../services/cuentas-por-cobrar.service';
import { AgendaService } from '../../../agenda/services/agenda.service';

@Component({
  selector: 'app-cuentas-por-cobrar',
  templateUrl: './cuentas-por-cobrar.page.html',
  styleUrls: ['./cuentas-por-cobrar.page.scss'],
  standalone: false,
})
export class CuentasPorCobrarPage implements OnInit, OnDestroy {
  cuentas: CuentaPorCobrar[] = [];
  cuentasFiltradas: CuentaPorCobrar[] = [];
  loading = true;
  saving = false;

  searchTerm = '';
  filtroEstado: 'todos' | EstadoCuentaPorCobrar = 'todos';
  fechaDesde = '';
  fechaHasta = '';
  page = 1;
  readonly pageSize = 10;

  modalCobroOpen = false;
  cuentaSeleccionada: CuentaPorCobrar | null = null;

  readonly metodosCobro: Array<CobroCuentaPorCobrar['metodoCobro']> = ['efectivo', 'tarjeta', 'transferencia'];

  readonly cobroForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    metodoCobro: ['efectivo' as CobroCuentaPorCobrar['metodoCobro'], Validators.required],
    fechaCobro: [new Date().toISOString().slice(0, 10), Validators.required],
    referencia: [''],
    nota: [''],
  });

  private readonly sub = new Subscription();

  constructor(
    private readonly service: CuentasPorCobrarService,
    private readonly authService: AuthService,
    private readonly loadingCtrl: LoadingController,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly fb: FormBuilder,
    private readonly agendaService: AgendaService,
  ) {}

  ngOnInit(): void {
    this.sub.add(this.service.listEnriquecida().subscribe({
      next: (items) => {
        this.cuentas = items || [];
        this.aplicarFiltros();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando cuentas por cobrar', error);
        this.loading = false;
      },
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get totalPorCobrar(): number {
    return this.cuentas.filter((c) => c.estado !== 'pagada' && c.estado !== 'anulada').reduce((a, c) => a + this.toNumber(c.balancePendiente), 0);
  }

  get cuentasPendientes(): number {
    return this.cuentas.filter((c) => c.estado === 'pendiente' || c.estado === 'parcial').length;
  }

  get cuentasVencidas(): number {
    const now = new Date().getTime();
    return this.cuentas.filter((c) => new Date(c.fechaVencimiento).getTime() < now && this.toNumber(c.balancePendiente) > 0 && c.estado !== 'anulada').length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.cuentasFiltradas.length / this.pageSize));
  }

  get cuentasPaginadas(): CuentaPorCobrar[] {
    const start = (this.page - 1) * this.pageSize;
    return this.cuentasFiltradas.slice(start, start + this.pageSize);
  }

  aplicarFiltros(): void {
    const q = this.normalize(this.searchTerm);
    const from = this.fechaDesde ? new Date(`${this.fechaDesde}T00:00:00`).getTime() : undefined;
    const to = this.fechaHasta ? new Date(`${this.fechaHasta}T23:59:59`).getTime() : undefined;

    this.cuentasFiltradas = this.cuentas.filter((c) => {
      if (this.filtroEstado !== 'todos' && c.estado !== this.filtroEstado) return false;
      const fecha = new Date(c.fechaVencimiento).getTime();
      if (from !== undefined && Number.isFinite(fecha) && fecha < from) return false;
      if (to !== undefined && Number.isFinite(fecha) && fecha > to) return false;
      const target = `${c.clienteNombre} ${c.numeroFactura}`;
      return !q || this.normalize(target).includes(q);
    });
    this.page = 1;
  }

  goPrevPage(): void {
    this.page = Math.max(1, this.page - 1);
  }

  goNextPage(): void {
    this.page = Math.min(this.totalPages, this.page + 1);
  }

  exportarExcel(): void {
    const rows = this.cuentasFiltradas.map((c) => ({
      Cliente: c.clienteNombre,
      Factura: c.numeroFactura,
      Emision: c.fechaEmision,
      Vencimiento: c.fechaVencimiento,
      MontoOriginal: this.toNumber(c.montoOriginal),
      MontoPagado: this.toNumber(c.montoPagado),
      BalancePendiente: this.toNumber(c.balancePendiente),
      Estado: c.estado,
      Moneda: c.moneda,
      MetodoOrigen: c.metodoOrigen,
      Origen: c.origen || 'factura',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CuentasPorCobrar');
    XLSX.writeFile(wb, `cuentas-por-cobrar-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  abrirCobro(cuenta: CuentaPorCobrar): void {
    if (cuenta.estado === 'anulada' || cuenta.estado === 'pagada' || this.toNumber(cuenta.balancePendiente) <= 0) return;
    this.cuentaSeleccionada = cuenta;
    this.cobroForm.reset({
      monto: this.toNumber(cuenta.balancePendiente),
      metodoCobro: 'efectivo',
      fechaCobro: new Date().toISOString().slice(0, 10),
      referencia: '',
      nota: '',
    });
    this.modalCobroOpen = true;
  }

  cerrarCobro(): void {
    this.modalCobroOpen = false;
    this.cuentaSeleccionada = null;
  }

  async registrarCobro(): Promise<void> {
    if (!this.cuentaSeleccionada || this.cobroForm.invalid || this.saving) return;

    const raw = this.cobroForm.getRawValue();
    const monto = this.toNumber(raw.monto);
    const balance = this.toNumber(this.cuentaSeleccionada.balancePendiente);
    if (monto <= 0 || monto > balance) {
      await this.toast('El monto debe ser mayor a 0 y no superar el balance pendiente.', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Registrando cobro…' });
    await loading.present();
    this.saving = true;
    try {
      const user = await firstValueFrom(this.authService.user$);
      const nuevoPagado = Number((this.toNumber(this.cuentaSeleccionada.montoPagado) + monto).toFixed(2));
      const nuevoBalance = Number(Math.max(0, this.toNumber(this.cuentaSeleccionada.montoOriginal) - nuevoPagado).toFixed(2));
      const nuevoEstado: EstadoCuentaPorCobrar = nuevoBalance <= 0 ? 'pagada' : 'parcial';

      await this.service.update(this.cuentaSeleccionada.id as string, {
        montoPagado: nuevoPagado,
        balancePendiente: nuevoBalance,
        estado: nuevoEstado,
        updatedAt: new Date().toISOString(),
      });

      await this.service.createCobro(this.cuentaSeleccionada.id as string, {
        cuentaId: this.cuentaSeleccionada.id as string,
        facturaId: this.cuentaSeleccionada.facturaId,
        clienteId: this.cuentaSeleccionada.clienteId,
        clienteNombre: this.cuentaSeleccionada.clienteNombre,
        monto,
        metodoCobro: raw.metodoCobro,
        fechaCobro: new Date(raw.fechaCobro).toISOString(),
        referencia: raw.referencia || undefined,
        nota: raw.nota || undefined,
        creadoPor: user?.uid || 'sistema',
        fechaCreacion: new Date().toISOString(),
      });

      if (this.cuentaSeleccionada.citaId) {
        await this.agendaService.updateCita(this.cuentaSeleccionada.citaId, {
          montoPagado: nuevoPagado,
          balancePendiente: nuevoBalance,
          estadoPago: nuevoBalance <= 0 ? 'pagada' : 'parcial',
          actualizadoEn: new Date().toISOString(),
        } as any);
      }

      await this.toast('Cobro registrado', 'success');
      this.cerrarCobro();
    } catch (error) {
      console.error('Error registrando cobro', error);
      await this.toast('No pudimos registrar el cobro', 'danger');
    } finally {
      this.saving = false;
      await loading.dismiss();
    }
  }

  async anular(cuenta: CuentaPorCobrar): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Anular cuenta por cobrar',
      message: 'Esta acción no elimina el registro y dejará la cuenta fuera de pendientes.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async () => {
            await this.service.update(cuenta.id as string, { estado: 'anulada', updatedAt: new Date().toISOString() });
            await this.toast('Cuenta anulada', 'success');
          },
        },
      ],
    });
    await alert.present();
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(this.toNumber(v));
  }

  formatDate(v: string): string {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '--';
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(d);
  }

  private toNumber(v: unknown): number {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  private normalize(v: unknown): string {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, color, duration: 2200, position: 'top' });
    await t.present();
  }
}
