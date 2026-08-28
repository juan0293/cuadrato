import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UsuarioModel } from '../../usuarios/models/usuario.model';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { Cliente } from '../models/cliente.model';
import { Cita } from '../models/cita.model';
import { AgendaService } from '../services/agenda.service';
import { ClientesService } from '../services/clientes.service';
import { toISODate } from '../utils/agenda-date.utils';
import { isTimeRangeValid } from '../utils/agenda-validation.utils';

@Component({
  standalone: false,
  selector: 'app-cita-form',
  templateUrl: './cita-form.page.html',
  styleUrls: ['./cita-form.page.scss'],
})
export class CitaFormPage implements OnInit {
  readonly artistas$ = this.usuariosService.list();
  readonly clientes$ = this.clientesService.getClientes();
  citaId = '';
  isEdit = false;
  quickClienteModalOpen = false;
  precioEstimadoInput = '0.00';

  readonly form = this.fb.nonNullable.group({
    clienteId: [''],
    clienteNombre: ['', [Validators.required]],
    clienteTelefono: ['', [Validators.required, Validators.minLength(7)]],
    clienteCorreo: ['', [Validators.email]],
    servicioNombre: ['', [Validators.required]],
    artistaId: ['', [Validators.required]],
    fecha: [toISODate(new Date()), [Validators.required]],
    horaInicio: ['09:00', [Validators.required]],
    horaFin: ['10:00', [Validators.required]],
    estado: ['pendiente' as Cita['estado'], [Validators.required]],
    precioEstimado: [0, [Validators.required, Validators.min(0.01)]],
    itbisPorcentaje: [0, [Validators.min(0), Validators.max(100)]],
    tipoAbono: ['porcentaje' as 'sin_abono' | 'porcentaje' | 'monto_fijo'],
    porcentajeAbono: [50],
    montoAbono: [0],
    observacion: [''],
    descripcionTrabajo: ['', [Validators.required]],
  });
  readonly quickClienteForm = this.fb.nonNullable.group({
    nombreCompleto: ['', [Validators.required]],
    telefono: [''],
    correo: ['', [Validators.email]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly agendaService: AgendaService,
    private readonly usuariosService: UsuariosService,
    private readonly clientesService: ClientesService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly loadingCtrl: LoadingController,
  ) {}

  ngOnInit(): void {
    this.citaId = this.route.snapshot.paramMap.get('id') ?? '';
    this.isEdit = !!this.citaId;
    if (this.isEdit) {
      this.loadCita();
    }
    this.precioEstimadoInput = this.formatMoneyInput(Number(this.form.value.precioEstimado || 0));
  }

  get montoAbonoCalculado(): number {
    const precio = this.parseMoneyInput(this.form.value.precioEstimado);
    const tipo = this.form.value.tipoAbono || 'sin_abono';
    if (tipo === 'porcentaje') {
      const porcentaje = Math.min(100, Math.max(1, Number(this.form.value.porcentajeAbono || 0)));
      return Number(((precio * porcentaje) / 100).toFixed(2));
    }
    if (tipo === 'monto_fijo') {
      return Number(Math.max(0, this.parseMoneyInput(this.form.value.montoAbono)).toFixed(2));
    }
    return 0;
  }

  get itbisMontoCalculado(): number {
    const base = this.parseMoneyInput(this.form.value.precioEstimado);
    const pct = Math.min(100, Math.max(0, Number(this.form.value.itbisPorcentaje || 0)));
    return Number((base * (pct / 100)).toFixed(2));
  }

  get totalConItbisCalculado(): number {
    const base = this.parseMoneyInput(this.form.value.precioEstimado);
    return Number((base + this.itbisMontoCalculado).toFixed(2));
  }

  get balancePendienteCalculado(): number {
    const precio = this.parseMoneyInput(this.form.value.precioEstimado);
    const abono = this.montoAbonoCalculado;
    return Number(Math.max(0, precio - abono).toFixed(2));
  }

  get tipoAbonoSeleccionado(): 'sin_abono' | 'porcentaje' | 'monto_fijo' {
    return this.form.value.tipoAbono || 'sin_abono';
  }

  get savePrimaryLabel(): string {
    if (this.isEdit) return 'Guardar cambios';
    return 'Guardar reserva';
  }

  get shouldShowSavePrimaryButton(): boolean {
    return this.isEdit || this.tipoAbonoSeleccionado === 'sin_abono';
  }

  get shouldShowFacturarAbonoButton(): boolean {
    return !this.isEdit && this.tipoAbonoSeleccionado !== 'sin_abono' && this.montoAbonoCalculado > 0;
  }

  get shouldShowFacturarTotalButton(): boolean {
    return !this.isEdit && this.tipoAbonoSeleccionado !== 'sin_abono';
  }

  get actionHintLabel(): string {
    if (this.isEdit) {
      return 'Actualiza la cita y conserva su programación.';
    }
    if (this.tipoAbonoSeleccionado === 'sin_abono') {
      return 'La cita se guardará sin pago inicial.';
    }
    return 'Puedes facturar el abono inicial o cobrar el total completo ahora.';
  }

  parseMoneyInput(value: any): number {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/rd\$/gi, '').replace(/\s/g, '');
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    const decimalPos = Math.max(lastDot, lastComma);
    let normalized = cleaned;
    if (decimalPos >= 0) {
      const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, '');
      const decPart = cleaned.slice(decimalPos + 1).replace(/[^\d]/g, '');
      normalized = `${intPart}.${decPart}`;
    } else {
      normalized = cleaned.replace(/[^\d-]/g, '');
    }
    const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  formatMoneyInput(value: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  onPrecioEstimadoInput(event: Event): void {
    const raw = String((event as CustomEvent).detail?.value ?? '');
    this.precioEstimadoInput = raw;
    this.form.patchValue({ precioEstimado: this.parseMoneyInput(raw) }, { emitEvent: false });
  }

  onPrecioEstimadoBlur(): void {
    const parsed = this.parseMoneyInput(this.form.value.precioEstimado);
    this.form.patchValue({ precioEstimado: parsed }, { emitEvent: false });
    this.precioEstimadoInput = this.formatMoneyInput(parsed);
  }

  onlyArtists(users: UsuarioModel[] | null): UsuarioModel[] {
    return (users ?? []).filter((item) => {
      const role = item.role ?? item.rol;
      const isArtist = role === 'artist' || role === 'artista';
      const isActive = item.status ? item.status === 'active' : item.activo !== false;
      return isArtist && isActive;
    });
  }

  onSelectCliente(cliente: Cliente): void {
    this.form.patchValue({
      clienteId: cliente.id || '',
      clienteNombre: cliente.nombreCompleto,
      clienteTelefono: cliente.telefono || '',
      clienteCorreo: cliente.correo || '',
    });
  }

  openQuickClienteModal(): void {
    this.quickClienteForm.reset({
      nombreCompleto: '',
      telefono: '',
      correo: '',
    });
    this.quickClienteModalOpen = true;
  }

  closeQuickClienteModal(): void {
    this.quickClienteModalOpen = false;
  }

  async saveQuickCliente(): Promise<void> {
    if (this.quickClienteForm.invalid) {
      await this.toastService.error('El nombre del cliente es obligatorio.');
      return;
    }

    const raw = this.quickClienteForm.getRawValue();
    const nombreCompleto = String(raw.nombreCompleto || '').trim();
    const telefono = String(raw.telefono || '').trim();
    const correo = String(raw.correo || '').trim();

    try {
      const clienteId = await this.clientesService.createCliente({
        nombreCompleto,
        telefono: telefono || undefined,
        correo: correo || undefined,
        activo: true,
        creadoEn: new Date().toISOString(),
      });

      this.form.patchValue({
        clienteId,
        clienteNombre: nombreCompleto,
        clienteTelefono: telefono,
        clienteCorreo: correo,
      });

      this.quickClienteModalOpen = false;
      await this.toastService.success('Cliente creado correctamente.');
    } catch {
      await this.toastService.error('No fue posible crear el cliente.');
    }
  }

  async save(mode: 'guardar' | 'abono' | 'total' = 'guardar'): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalidField();
      await this.toastService.error('Completa los campos requeridos antes de guardar.');
      return;
    }

    const raw = this.form.getRawValue();
    const precioEstimado = this.parseMoneyInput(raw.precioEstimado);
    const montoAbonoSugerido = this.montoAbonoCalculado;
    if (precioEstimado <= 0) {
      await this.toastService.error('Indica el precio estimado de la cita.');
      return;
    }
    if (montoAbonoSugerido > precioEstimado) {
      await this.toastService.error('El abono no puede ser mayor al precio estimado.');
      return;
    }
    if (!isTimeRangeValid(raw.horaInicio, raw.horaFin)) {
      await this.toastService.error('La hora de fin debe ser mayor que la de inicio.');
      return;
    }

    const artists = await firstValueFrom(this.usuariosService.list());
    const artist = artists.find((item) => item.id === raw.artistaId);
    if (!artist) {
      await this.toastService.error('Selecciona un artista válido.');
      return;
    }

    const currentUser = await firstValueFrom(this.authService.user$);
    const payload: Cita = {
      id: this.citaId || undefined,
      clienteId: raw.clienteId || undefined,
      clienteNombre: raw.clienteNombre.trim(),
      clienteTelefono: raw.clienteTelefono?.trim() || undefined,
      clienteCorreo: raw.clienteCorreo?.trim() || undefined,
      servicioNombre: raw.servicioNombre.trim(),
      artistaId: raw.artistaId,
      artistaNombre: artist.displayName ?? artist.nombre ?? 'Artista',
      fecha: raw.fecha,
      horaInicio: raw.horaInicio,
      horaFin: raw.horaFin,
      descripcionTrabajo: raw.descripcionTrabajo.trim(),
      estado: raw.estado,
      observacion: raw.observacion?.trim() || undefined,
      precioEstimado: Number(precioEstimado || 0),
      precioBase: Number(precioEstimado || 0),
      itbisPorcentaje: Number(raw.itbisPorcentaje || 0),
      itbisMonto: this.itbisMontoCalculado,
      totalConItbis: this.totalConItbisCalculado,
      montoPagado: Number(this.isEdit ? 0 : 0),
      balancePendiente: Number(this.totalConItbisCalculado.toFixed(2)),
      estadoPago: 'sin_pago',
      tipoAbono: raw.tipoAbono,
      porcentajeAbono: raw.tipoAbono === 'porcentaje' ? Number(raw.porcentajeAbono || 50) : undefined,
      montoAbonoSugerido: Number(montoAbonoSugerido.toFixed(2)),
      creadaPor: currentUser?.uid ?? 'sistema',
      fechaCreacion: this.isEdit ? new Date().toISOString() : new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
      duracionMinutos: this.diffMinutes(raw.horaInicio, raw.horaFin),
    };

    const loading = await this.loadingCtrl.create({ message: mode === 'guardar' ? 'Guardando cita…' : 'Preparando factura…' });
    await loading.present();
    try {
      if (this.isEdit && this.citaId) {
        await this.agendaService.updateCita(this.citaId, payload);
        await this.toastService.success('Cita agendada');
        await this.router.navigateByUrl('/admin/agenda');
      } else {
        const nuevaCitaId = await this.agendaService.createCita(payload);
        await this.toastService.success(mode === 'guardar' ? 'Cita agendada' : 'Cita lista para facturar');
        if (mode === 'guardar') {
          await this.router.navigateByUrl('/admin/agenda');
        } else {
          await this.router.navigate(['/admin/facturacion'], {
            queryParams: {
              citaId: nuevaCitaId,
              modo: mode === 'abono' ? 'abono' : 'total',
            },
          });
        }
      }
    } catch (error) {
      if ((error as Error).message === 'CONFLICT_SCHEDULE') {
        await this.toastService.error('Conflicto de horario para el artista seleccionado.');
        return;
      }
      await this.toastService.error('No pudimos guardar la cita');
    } finally {
      await loading.dismiss();
    }
  }

  cancel(): void {
    this.router.navigateByUrl('/admin/agenda');
  }

  private async loadCita(): Promise<void> {
    const items = await firstValueFrom(this.agendaService.getCitas());
    const cita = items.find((item) => item.id === this.citaId);
    if (!cita) {
      await this.toastService.error('No se encontró la cita.');
      await this.router.navigateByUrl('/admin/agenda');
      return;
    }

    this.form.patchValue({
      clienteId: cita.clienteId || '',
      clienteNombre: cita.clienteNombre,
      clienteTelefono: cita.clienteTelefono || '',
      clienteCorreo: cita.clienteCorreo || '',
      servicioNombre: cita.servicioNombre || '',
      artistaId: cita.artistaId,
      fecha: cita.fecha,
      horaInicio: cita.horaInicio,
      horaFin: cita.horaFin,
      estado: cita.estado,
      precioEstimado: cita.precioEstimado || 0,
      tipoAbono: cita.tipoAbono || 'sin_abono',
      porcentajeAbono: cita.porcentajeAbono || 50,
      montoAbono: cita.montoAbonoSugerido || 0,
      itbisPorcentaje: Number(cita.itbisPorcentaje || 0),
      observacion: cita.observacion || '',
      descripcionTrabajo: cita.descripcionTrabajo,
    });
    this.precioEstimadoInput = this.formatMoneyInput(Number(cita.precioEstimado || 0));
  }

  private focusFirstInvalidField(): void {
    const invalidControl = Object.keys(this.form.controls).find((key) => this.form.controls[key as keyof typeof this.form.controls].invalid);
    if (!invalidControl) return;
    const element = document.querySelector(`[formControlName="${invalidControl}"]`) as HTMLElement | null;
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => element.focus(), 200);
  }

  private toMinutes(hour: string): number {
    const [h, m] = hour.split(':').map(Number);
    return (h * 60) + m;
  }

  private diffMinutes(start: string, end: string): number {
    return Math.max(0, this.toMinutes(end) - this.toMinutes(start));
  }
}
