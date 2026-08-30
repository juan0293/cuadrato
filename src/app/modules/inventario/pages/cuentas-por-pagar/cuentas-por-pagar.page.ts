import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { CuentaPorPagar, CuentaPorPagarKpis, EstadoCuentaPorPagar, PagoCuentaPorPagar } from '../../models/cuenta-por-pagar.model';
import { CuentasPorPagarService } from '../../services/cuentas-por-pagar.service';
import { InventarioThemeService } from '../../services/inventario-theme.service';

@Component({
  selector: 'app-cuentas-por-pagar',
  templateUrl: './cuentas-por-pagar.page.html',
  styleUrls: ['./cuentas-por-pagar.page.scss'],
  standalone: false,
})
export class CuentasPorPagarPage implements OnInit, OnDestroy {
  cuentas: CuentaPorPagar[] = [];
  cuentasFiltradas: CuentaPorPagar[] = [];
  loading = true;
  saving = false;

  searchTerm = '';
  filtroEstado: 'todos' | EstadoCuentaPorPagar = 'todos';
  fechaDesde = '';
  fechaHasta = '';
  soloVencidas = false;
  soloProximas = false;

  modalNuevaCuentaOpen = false;
  modalPagoOpen = false;

  cuentaSeleccionada: CuentaPorPagar | null = null;

  readonly metodosPago: Array<PagoCuentaPorPagar['metodoPago']> = ['efectivo', 'transferencia', 'tarjeta', 'cheque'];

  readonly nuevaCuentaForm = this.fb.nonNullable.group({
    proveedorId: ['', Validators.required],
    proveedorNombre: ['', Validators.required],
    numeroFactura: ['', Validators.required],
    fechaEmision: [new Date().toISOString().slice(0, 10), Validators.required],
    fechaVencimiento: ['', Validators.required],
    montoOriginal: [0, [Validators.required, Validators.min(0.01)]],
    moneda: ['DOP', Validators.required],
    nota: [''],
  });

  readonly pagoForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    metodoPago: ['efectivo' as PagoCuentaPorPagar['metodoPago'], Validators.required],
    fechaPago: [new Date().toISOString().slice(0, 10), Validators.required],
    referencia: [''],
    nota: [''],
  });

  private readonly sub = new Subscription();

  constructor(
    private readonly cuentasService: CuentasPorPagarService,
    private readonly authService: AuthService,
    private readonly loadingCtrl: LoadingController,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly themeService: InventarioThemeService,
  ) {}

  get inventoryTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  toggleInventoryTheme(): void {
    this.themeService.toggle();
  }

  get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm.trim() || this.filtroEstado !== 'todos' || this.fechaDesde || this.fechaHasta || this.soloVencidas || this.soloProximas);
  }

  ngOnInit(): void {
    this.sub.add(
      this.cuentasService.listEnriquecida().subscribe({
        next: (items) => {
          this.cuentas = items || [];
          this.aplicarFiltros();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error cargando cuentas por pagar', error);
          this.loading = false;
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get kpis(): CuentaPorPagarKpis {
    const now = new Date();
    const mes = now.getMonth();
    const anio = now.getFullYear();

    const totalPendiente = this.cuentas
      .filter((c) => c.estado !== 'pagada' && c.estado !== 'anulada')
      .reduce((acc, c) => acc + this.toNumber(c.balancePendiente), 0);

    const totalVencido = this.cuentas
      .filter((c) => this.isOverdue(c) && this.toNumber(c.balancePendiente) > 0)
      .reduce((acc, c) => acc + this.toNumber(c.balancePendiente), 0);

    const pagadoMesActual = this.cuentas.reduce((acc, c) => {
      const fc = this.parseDateSafe(c.fechaCreacion);
      if (!fc) return acc;
      if (fc.getMonth() === mes && fc.getFullYear() === anio) return acc + this.toNumber(c.montoPagado);
      return acc;
    }, 0);

    const facturasPendientes = this.cuentas.filter((c) => c.estado === 'pendiente' || c.estado === 'parcial').length;

    return { totalPendiente, totalVencido, pagadoMesActual, facturasPendientes };
  }

  aplicarFiltros(): void {
    const q = this.normalizeText(this.searchTerm);
    this.cuentasFiltradas = this.cuentas.filter((c) => {
      if (this.filtroEstado !== 'todos' && this.getEstadoCuenta(c) !== this.filtroEstado) return false;

      const fecha = this.parseDateSafe(c.fechaVencimiento);
      const desde = this.parseDateSafe(this.fechaDesde);
      const hasta = this.parseDateSafe(this.fechaHasta);
      if (desde && fecha && fecha < new Date(desde.setHours(0, 0, 0, 0))) return false;
      if (hasta && fecha && fecha > new Date(hasta.setHours(23, 59, 59, 999))) return false;

      if (this.soloVencidas && !this.isOverdue(c)) return false;
      if (this.soloProximas && !this.isDueSoon(c)) return false;

      const proveedor = this.normalizeText(c.proveedorNombre);
      const factura = this.normalizeText(c.numeroFactura);
      return !q || proveedor.includes(q) || factura.includes(q);
    });
  }

  clearFiltros(): void {
    this.searchTerm = '';
    this.filtroEstado = 'todos';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.soloVencidas = false;
    this.soloProximas = false;
    this.aplicarFiltros();
  }

  toggleSoloVencidas(): void {
    this.soloVencidas = !this.soloVencidas;
    if (this.soloVencidas) this.soloProximas = false;
    this.aplicarFiltros();
  }

  toggleSoloProximas(): void {
    this.soloProximas = !this.soloProximas;
    if (this.soloProximas) this.soloVencidas = false;
    this.aplicarFiltros();
  }

  abrirNuevaCuenta(): void {
    this.nuevaCuentaForm.reset({
      proveedorId: '',
      proveedorNombre: '',
      numeroFactura: '',
      fechaEmision: new Date().toISOString().slice(0, 10),
      fechaVencimiento: '',
      montoOriginal: 0,
      moneda: 'DOP',
      nota: '',
    });
    this.modalNuevaCuentaOpen = true;
  }

  cerrarNuevaCuenta(): void {
    this.modalNuevaCuentaOpen = false;
  }

  abrirPago(cuenta: CuentaPorPagar): void {
    if (cuenta.estado === 'anulada') {
      void this.showToast('No puedes registrar pago en una cuenta anulada.', 'warning');
      return;
    }
    if (this.toNumber(cuenta.balancePendiente) <= 0 || cuenta.estado === 'pagada') {
      void this.showToast('Esta cuenta ya está pagada.', 'warning');
      return;
    }

    this.cuentaSeleccionada = cuenta;
    this.pagoForm.reset({
      monto: this.toNumber(cuenta.balancePendiente),
      metodoPago: 'efectivo',
      fechaPago: new Date().toISOString().slice(0, 10),
      referencia: '',
      nota: '',
    });
    this.modalPagoOpen = true;
  }

  cerrarPago(): void {
    this.modalPagoOpen = false;
    this.cuentaSeleccionada = null;
  }

  async crearCuenta(): Promise<void> {
    if (this.saving) return;

    if (this.nuevaCuentaForm.invalid) {
      this.nuevaCuentaForm.markAllAsTouched();
      await this.showToast('Completa los campos obligatorios de la cuenta.', 'danger');
      return;
    }

    const raw = this.nuevaCuentaForm.getRawValue();
    const montoOriginal = this.toNumber(raw.montoOriginal);
    if (montoOriginal <= 0) {
      await this.showToast('El monto original debe ser mayor a cero.', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Guardando cuenta…' });
    await loading.present();
    this.saving = true;

    try {
      const user = await firstValueFrom(this.authService.user$);
      const payload: CuentaPorPagar = {
        proveedorId: raw.proveedorId,
        proveedorNombre: raw.proveedorNombre,
        compraId: '',
        numeroFactura: raw.numeroFactura,
        montoOriginal,
        montoPagado: 0,
        balancePendiente: montoOriginal,
        fechaEmision: new Date(raw.fechaEmision).toISOString(),
        fechaVencimiento: new Date(raw.fechaVencimiento).toISOString(),
        estado: 'pendiente',
        moneda: raw.moneda,
        ...(raw.nota.trim() ? { nota: raw.nota.trim() } : {}),
        creadoPor: user?.uid || 'sistema',
        fechaCreacion: new Date().toISOString(),
      };

      await this.cuentasService.create(payload);
      await this.showToast('Cuenta registrada', 'success');
      this.modalNuevaCuentaOpen = false;
    } catch (error) {
      console.error('Error creando cuenta por pagar', error);
      await this.showToast('No pudimos guardar la cuenta', 'danger');
    } finally {
      this.saving = false;
      await loading.dismiss();
    }
  }

  async registrarPago(): Promise<void> {
    if (!this.cuentaSeleccionada || this.saving) return;
    if (this.pagoForm.invalid) {
      this.pagoForm.markAllAsTouched();
      await this.showToast('Completa los campos obligatorios del pago.', 'danger');
      return;
    }

    const raw = this.pagoForm.getRawValue();
    const monto = this.toNumber(raw.monto);
    const balance = this.toNumber(this.cuentaSeleccionada.balancePendiente);

    if (monto <= 0 || monto > balance) {
      await this.showToast('El monto debe ser mayor a 0 y no superar el balance pendiente.', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Registrando pago…' });
    await loading.present();
    this.saving = true;

    try {
      const user = await firstValueFrom(this.authService.user$);
      const nuevoPagado = Number((this.toNumber(this.cuentaSeleccionada.montoPagado) + monto).toFixed(2));
      const nuevoBalance = Number((this.toNumber(this.cuentaSeleccionada.montoOriginal) - nuevoPagado).toFixed(2));
      const estado: EstadoCuentaPorPagar = nuevoBalance <= 0 ? 'pagada' : 'parcial';

      await this.cuentasService.update(this.cuentaSeleccionada.id as string, {
        montoPagado: nuevoPagado,
        balancePendiente: Math.max(0, nuevoBalance),
        estado,
      });

      const pagoPayload: PagoCuentaPorPagar = {
        cuentaId: this.cuentaSeleccionada.id as string,
        proveedorId: this.cuentaSeleccionada.proveedorId,
        proveedorNombre: this.cuentaSeleccionada.proveedorNombre,
        monto,
        metodoPago: raw.metodoPago,
        fechaPago: new Date(raw.fechaPago).toISOString(),
        ...(raw.referencia.trim() ? { referencia: raw.referencia.trim() } : {}),
        ...(raw.nota.trim() ? { nota: raw.nota.trim() } : {}),
        creadoPor: user?.uid || 'sistema',
        fechaCreacion: new Date().toISOString(),
      };

      await this.cuentasService.createPago(this.cuentaSeleccionada.id as string, pagoPayload);

      await this.showToast('Pago registrado', 'success');
      this.cerrarPago();
    } catch (error) {
      console.error('Error registrando pago', error);
      await this.showToast('No pudimos registrar el pago', 'danger');
    } finally {
      this.saving = false;
      await loading.dismiss();
    }
  }

  async anularCuenta(cuenta: CuentaPorPagar): Promise<void> {
    const alert = await this.alertCtrl.create({
      cssClass: 'inventory-confirm-alert',
      header: 'Anular cuenta por pagar',
      message: 'Esta cuenta dejará de formar parte de los pendientes financieros. Esta acción no elimina el registro.',
      inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo de anulación (opcional)' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async (data) => {
            if (!cuenta.id) return;
            try {
              const user = await firstValueFrom(this.authService.user$);
              const motivo = String(data?.motivo || '').trim();
              await this.cuentasService.update(cuenta.id, {
                estado: 'anulada',
                fechaAnulacion: new Date().toISOString(),
                ...(motivo ? { motivoAnulacion: motivo } : {}),
                anuladoPor: user?.uid || 'sistema',
              });
              await this.showToast('Cuenta anulada correctamente.', 'success');
            } catch (error) {
              console.error('Error anulando cuenta', error);
              await this.showToast('No pudimos anular la cuenta', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  marcarComoPagada(cuenta: CuentaPorPagar): void {
    if (this.toNumber(cuenta.balancePendiente) > 0) return;
    if (!cuenta.id) return;
    void this.cuentasService.update(cuenta.id, { estado: 'pagada' });
  }

  goToDetail(id?: string): void {
    if (!id) return;
    this.router.navigate(['/admin/inventario/cuentas-por-pagar', id]);
  }

  async openMobileActions(cuenta: CuentaPorPagar): Promise<void> {
    const buttons: Array<{ text: string; icon: string; role?: string; handler?: () => void }> = [
      { text: 'Ver detalle', icon: 'eye-outline', handler: () => this.goToDetail(cuenta.id) },
    ];

    if (cuenta.estado !== 'anulada' && cuenta.estado !== 'pagada' && this.toNumber(cuenta.balancePendiente) > 0) {
      buttons.push({ text: 'Registrar pago', icon: 'cash-outline', handler: () => this.abrirPago(cuenta) });
    }

    if (this.toNumber(cuenta.balancePendiente) <= 0) {
      buttons.push({ text: 'Marcar pagada', icon: 'checkmark-done-outline', handler: () => this.marcarComoPagada(cuenta) });
    }

    if (cuenta.estado !== 'anulada') {
      buttons.push({ text: 'Anular', icon: 'ban-outline', role: 'destructive', handler: () => this.anularCuenta(cuenta) });
    }

    buttons.push({ text: 'Cerrar', icon: 'close-outline', role: 'cancel' });

    const sheet = await this.actionSheetCtrl.create({
      cssClass: 'inventory-actions-sheet',
      header: 'Opciones de la cuenta',
      buttons,
    });
    await sheet.present();
  }

  parseDateSafe(value: unknown): Date | null {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  formatCurrency(value: unknown): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(this.toNumber(value));
  }

  formatDate(value: unknown): string {
    const date = this.parseDateSafe(value);
    if (!date) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  isOverdue(cuenta: CuentaPorPagar): boolean {
    const fecha = this.parseDateSafe(cuenta.fechaVencimiento);
    if (!fecha) return false;
    return fecha.getTime() < Date.now() && this.toNumber(cuenta.balancePendiente) > 0 && cuenta.estado !== 'anulada';
  }

  isDueSoon(cuenta: CuentaPorPagar): boolean {
    const fecha = this.parseDateSafe(cuenta.fechaVencimiento);
    if (!fecha) return false;
    const now = new Date();
    const diff = fecha.getTime() - now.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 7 && this.toNumber(cuenta.balancePendiente) > 0 && cuenta.estado !== 'anulada';
  }

  getEstadoCuenta(cuenta: CuentaPorPagar): EstadoCuentaPorPagar {
    if (cuenta.estado === 'anulada') return 'anulada';
    if (this.toNumber(cuenta.balancePendiente) <= 0) return 'pagada';
    if (this.isOverdue(cuenta)) return 'vencida';
    if (this.toNumber(cuenta.montoPagado) > 0) return 'parcial';
    return 'pendiente';
  }

  getEstadoBadgeClass(cuenta: CuentaPorPagar): string {
    const estado = this.getEstadoCuenta(cuenta);
    if (estado === 'pagada') return 'estado-badge estado-badge--pagada';
    if (estado === 'vencida') return 'estado-badge estado-badge--vencida';
    if (estado === 'parcial') return 'estado-badge estado-badge--parcial';
    if (estado === 'anulada') return 'estado-badge estado-badge--anulada';
    return 'estado-badge estado-badge--pendiente';
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeText(value: unknown): string {
    return String(value || '').toLowerCase().trim();
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color, duration: 2200, position: 'bottom' });
    await toast.present();
  }
}
