import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController, IonInput, LoadingController } from '@ionic/angular';
import { combineLatest, firstValueFrom, map, Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { formatCurrencyDOP } from '../../../core/utils/currency.utils';
import { Cita } from '../../agenda/models/cita.model';
import { Cliente } from '../../agenda/models/cliente.model';
import { AgendaService } from '../../agenda/services/agenda.service';
import { ClientesService } from '../../agenda/services/clientes.service';
import { ProductoServicio } from '../../inventario/models/producto-servicio.model';
import { ProductosServiciosService } from '../../inventario/services/productos-servicios.service';
import { CuentasPorCobrarService } from '../services/cuentas-por-cobrar.service';
import { FacturaItem } from '../models/factura-item.model';
import { Factura } from '../models/factura.model';
import { DENOMINACIONES_DOP, DesgloseEfectivo, TurnoCaja, TurnoTotales } from '../models/turno-caja.model';
import { PdfFacturaService } from '../services/pdf-factura.service';
import { FacturacionService } from '../services/facturacion.service';
import { TurnosCajaService } from '../services/turnos-caja.service';
import { PrinterConfiguration } from '../models/printer-configuration.model';
import { InvoicePrintingService } from '../services/invoice-printing.service';
import { PrinterConfigurationService } from '../services/printer-configuration.service';
import { CuentaAbierta, CuentaAbiertaConsumo } from '../models/cuenta-abierta.model';
import { CuentasAbiertasService } from '../services/cuentas-abiertas.service';
import { recalcularConsumo } from '../helpers/cuenta-abierta.helper';
import { aplicarPagoAFactura } from '../helpers/pagos-factura.helper';

interface PosCartItem extends FacturaItem {
  key: string;
}

@Component({
  standalone: false,
  selector: 'app-facturacion',
  templateUrl: './facturacion.page.html',
  styleUrls: ['./facturacion.component.scss'],
})
export class FacturacionPage implements OnInit, OnDestroy {
  private catalogSearch?: IonInput;
  private viewEntered = false;
  private catalogFocusPending = true;
  private catalogFocusFrame?: number;
  private cartItemsContainer?: HTMLElement;
  private cartScrollFrame?: number;
  private pendingCartItemKey?: string;
  private cartResizeObserver?: ResizeObserver;

  @ViewChild('cartItemsContainer')
  set cartItemsViewport(ref: ElementRef<HTMLElement> | undefined) {
    this.cartResizeObserver?.disconnect();
    this.cartItemsContainer = ref?.nativeElement;
    if (this.cartItemsContainer) {
      // En móvil el carrito puede estar oculto mientras se escanea el catálogo.
      // Completar el desplazamiento cuando el panel vuelva a estar visible.
      this.cartResizeObserver = new ResizeObserver(() => this.showLastAddedCartItem());
      this.cartResizeObserver.observe(this.cartItemsContainer);
      this.showLastAddedCartItem();
    }
  }

  private showLastAddedCartItem(key?: string): void {
    if (key) this.pendingCartItemKey = key;
    if (!this.cartItemsContainer || !this.pendingCartItemKey || this.cartScrollFrame !== undefined) return;
    this.cartScrollFrame = requestAnimationFrame(() => {
      this.cartScrollFrame = undefined;
      const container = this.cartItemsContainer;
      if (!container?.clientHeight || !this.pendingCartItemKey) return;
      const row = Array.from(container.children).find((child) => child.getAttribute('data-cart-key') === this.pendingCartItemKey) as HTMLElement | undefined;
      if (!row) return;
      const viewport = container.getBoundingClientRect();
      const item = row.getBoundingClientRect();
      if (item.top < viewport.top || item.height > container.clientHeight) {
        container.scrollTop += item.top - viewport.top;
      } else if (item.bottom > viewport.bottom) {
        container.scrollTop += item.bottom - viewport.bottom;
      }
      this.pendingCartItemKey = undefined;
    });
  }

  @ViewChild('catalogSearch')
  set catalogSearchInput(input: IonInput | undefined) {
    this.catalogSearch = input;
    this.focusCatalogSearchIfReady();
  }

  productos: ProductoServicio[] = [];
  productosFiltrados: ProductoServicio[] = [];
  productosPage = 1;
  readonly productosPageSize = 12;
  citas: Cita[] = [];
  clientes: Cliente[] = [];
  cartItems: PosCartItem[] = [];
  selectedCliente?: Cliente;
  selectedCita?: Cita;
  selectedCitaModo: 'abono' | 'total' | 'pendiente' = 'total';
  loading = true;
  tabMobile: 'catalogo' | 'carrito' = 'catalogo';
  catalogStockFilter: 'todos' | 'disponibles' = 'todos';
  posTheme: 'light' | 'dark' = 'light';
  quickClienteModalOpen = false;
  private openQuickClienteAfterSelectorDismiss = false;
  clienteSelectorModalOpen = false;
  citaSelectorModalOpen = false;
  cobroModalOpen = false;
  cobroSubmitting = false;
  cobroKeyboardReady = false;
  isEmitting = false;
  facturasModalOpen = false;
  facturasModalLoading = false;
  facturasModalEstado: 'emitida' | 'borrador' = 'emitida';
  facturasFechaDesde = '';
  facturasFechaHasta = '';
  facturasDelDia: Factura[] = [];
  facturasModalPage = 1;
  readonly facturasModalPageSize = 8;
  facturasActionsPopoverOpen = false;
  facturasActionsEvent?: Event;
  selectedFacturaAction?: Factura;
  clientesFiltrados: Cliente[] = [];
  clienteSearchTerm = '';
  citaSearchTerm = '';
  citaFechaDesde = '';
  citaFechaHasta = '';
  turnoActivo: TurnoCaja | null = null;
  turnoLoading = false;
  turnoActionLoading = false;
  turnoTotales: TurnoTotales = {
    totalVentas: 0,
    totalEfectivo: 0,
    totalTarjeta: 0,
    totalTransferencia: 0,
    totalCredito: 0,
    cantidadFacturas: 0,
  };
  showCierreTurnoModal = false;
  printerSettingsModalOpen = false;
  printerConfiguration?: PrinterConfiguration;
  cuentasAbiertas: CuentaAbierta[] = [];
  cuentasModalOpen = false;
  cuentasLoading = true;
  cuentasError = '';
  cuentaSearch = '';
  nuevaCuentaNombre = '';
  nuevaCuentaClienteId = '';
  cuentaActiva: CuentaAbierta | null = null;
  cuentaActionBusy = false;
  cuentaEstado: 'guardada' | 'guardando' | 'error' | 'conflicto' = 'guardada';
  cuentaError = '';
  cuentaRecuperacion = false;
  private cuentaUid = '';
  private cuentaResponsableNombre = '';
  private cuentaPendiente?: CuentaAbiertaConsumo;
  private cuentaSaveTask?: Promise<boolean>;
  private cuentasSub?: Subscription;

  get cuentasFiltradas(): CuentaAbierta[] {
    const q = this.normalizeText(this.cuentaSearch);
    return this.cuentasAbiertas.filter(c => !q || this.normalizeText(`${c.clienteNombre} ${c.id}`).includes(q));
  }

  get cuentaEdicionBloqueada(): boolean {
    return this.isEmitting || this.cuentaActionBusy || (!!this.cuentaActiva && this.cuentaEstado === 'conflicto');
  }

  cargarCuentasAbiertas(): void {
    this.cuentasSub?.unsubscribe();
    this.cuentasLoading = true;
    this.cuentasError = '';
    this.cuentasSub = this.cuentasAbiertasService.list().subscribe({
      next: cuentas => { this.cuentasAbiertas = cuentas; this.cuentasLoading = false; },
      error: () => { this.cuentasLoading = false; this.cuentasError = 'No se pudieron cargar las cuentas. Verifica conexión y permisos.'; },
    });
    this.sub.add(this.cuentasSub);
  }

  async abrirCuentas(): Promise<void> {
    this.cuentasModalOpen = true;
    const user = await firstValueFrom(this.authService.user$);
    this.cuentaUid = user?.uid || '';
    this.cuentaResponsableNombre = user?.displayName || user?.email || 'Usuario de caja';
    try { this.cuentaRecuperacion = !!localStorage.getItem(this.recuperacionCuentaKey); } catch { /* Almacenamiento no disponible. */ }
  }

  private get recuperacionCuentaKey(): string { return `cuadrato.cuenta-pendiente.${this.cuentaUid}`; }

  private consumoActual(nombre?: string): CuentaAbiertaConsumo {
    return {
      clienteNombre: nombre || this.selectedCliente?.nombreCompleto || this.cuentaActiva?.clienteNombre || 'Cuenta sin nombre',
      clienteId: this.facturaForm.controls.clienteId.value || '',
      items: JSON.parse(JSON.stringify(this.cartItems)), descuentoGlobal: this.descuentoGlobal,
    };
  }

  private registrarRecuperacionCuenta(): void {
    if (!this.cuentaActiva || !this.cuentaPendiente) return;
    try {
      localStorage.setItem(this.recuperacionCuentaKey, JSON.stringify({ cuenta: this.cuentaActiva, consumo: this.cuentaPendiente }));
      this.cuentaRecuperacion = true;
    } catch { this.cuentaError = 'El dispositivo no permite respaldo local. Espera a ver “Guardada” antes de salir.'; }
  }

  private borrarRecuperacionCuenta(): void {
    try { localStorage.removeItem(this.recuperacionCuentaKey); } catch { /* No afecta la cuenta persistida. */ }
    this.cuentaRecuperacion = false;
  }

  private marcarCuentaModificada(): void {
    if (!this.cuentaActiva || this.cuentaEdicionBloqueada) return;
    this.cuentaPendiente = this.consumoActual();
    this.registrarRecuperacionCuenta();
    if (this.cuentaEstado !== 'conflicto') void this.guardarCuentaActual();
  }

  async guardarCuentaActual(): Promise<boolean> {
    if (this.cuentaSaveTask) return this.cuentaSaveTask;
    if (!this.cuentaActiva) return true;
    if (this.cuentaEstado === 'conflicto') return false;
    this.cuentaSaveTask = this.persistirConsumos().finally(() => { this.cuentaSaveTask = undefined; });
    return this.cuentaSaveTask;
  }

  private async persistirConsumos(): Promise<boolean> {
    while (this.cuentaPendiente && this.cuentaActiva) {
      const consumo = this.cuentaPendiente;
      this.cuentaPendiente = undefined;
      this.cuentaEstado = 'guardando';
      try {
        this.cuentaActiva = await this.cuentasAbiertasService.guardar(this.cuentaActiva.id, this.cuentaActiva.version, consumo, this.cuentaUid);
        const pendiente = this.cuentaPendiente as CuentaAbiertaConsumo | undefined;
        if (pendiente) {
          this.cuentaActiva = { ...this.cuentaActiva, clienteNombre: pendiente.clienteNombre, clienteId: pendiente.clienteId };
          this.registrarRecuperacionCuenta();
        }
      } catch (error) {
        this.cuentaPendiente = this.cuentaPendiente || consumo;
        const message = String((error as Error)?.message || '');
        this.cuentaEstado = ['ACCOUNT_CONFLICT', 'ACCOUNT_NOT_OPEN'].includes(message) ? 'conflicto' : 'error';
        this.cuentaError = this.cuentaEstado === 'conflicto'
          ? 'Otro usuario cambió, cobró o canceló esta cuenta. Tus cambios locales se conservan. Recarga antes de continuar.'
          : 'No se guardaron los últimos cambios. Se conserva un respaldo local; revisa la conexión y reintenta antes de cobrar.';
        if (message === 'ACCOUNT_INVALID_DISCOUNT') this.cuentaError = 'El descuento global debe ser un importe válido mayor o igual a cero.';
        if (message === 'ACCOUNT_INVALID_ITEM') this.cuentaError = 'Revisa cantidades, precios, impuestos y descuentos: hay un importe inválido en los consumos.';
        this.registrarRecuperacionCuenta();
        return false;
      }
    }
    this.cuentaEstado = 'guardada';
    this.cuentaError = '';
    this.borrarRecuperacionCuenta();
    return true;
  }

  async crearCuenta(): Promise<void> {
    if (this.cuentaActionBusy || !this.cuentaUid) return;
    const cliente = this.clientes.find(c => c.id === this.nuevaCuentaClienteId);
    const nombre = cliente?.nombreCompleto || this.nuevaCuentaNombre.trim();
    if (!nombre) { await this.toastService.error('Selecciona un cliente o escribe un nombre para la cuenta.'); return; }
    this.cuentaActionBusy = true;
    let cuenta: CuentaAbierta | undefined;
    try {
      cuenta = await this.cuentasAbiertasService.crear({ clienteNombre: nombre, clienteId: cliente?.id || '', items: [], descuentoGlobal: 0 }, this.cuentaUid, this.cuentaResponsableNombre);
      this.nuevaCuentaNombre = ''; this.nuevaCuentaClienteId = '';
    } catch { await this.toastService.error('No se pudo abrir la cuenta. Verifica tu conexión y permisos.'); }
    finally { this.cuentaActionBusy = false; }
    if (cuenta) await this.abrirCuenta(cuenta);
  }

  private async prepararCarritoParaCuenta(): Promise<boolean> {
    if (!this.cartItems.length && !this.cuentaActiva) return true;
    const alert = await this.alertCtrl.create({
      header: 'El carrito tiene consumos',
      message: this.cuentaActiva ? 'Guardaremos la cuenta actual antes de abrir la seleccionada.'
        : 'Puedes guardar este carrito como otra cuenta antes de continuar. Los consumos no se mezclarán.',
      inputs: this.cuentaActiva ? [] : [{ name: 'nombre', type: 'text', placeholder: 'Nombre para guardar el carrito', value: this.selectedCliente?.nombreCompleto || 'Consumos pendientes' }],
      buttons: [{ text: 'Volver', role: 'cancel' }, { text: 'Guardar actual y abrir', role: 'guardar' }],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'guardar') return false;
    if (this.cuentaActiva) return this.guardarCuentaActual();
    if (this.selectedCita) { await this.toastService.error('Completa o guarda la factura de la cita antes de abrir una cuenta.'); return false; }
    const nombre = String(result.data?.values?.nombre || '').trim();
    if (!nombre) { await this.toastService.error('Escribe un nombre para conservar el carrito.'); return false; }
    const guardada = await this.cuentasAbiertasService.crear(this.consumoActual(nombre), this.cuentaUid, this.cuentaResponsableNombre);
    this.cargarCuentaEnCarrito(guardada);
    return true;
  }

  async abrirCuenta(cuenta: CuentaAbierta): Promise<void> {
    if (this.cuentaEdicionBloqueada) return;
    if (this.cuentaActiva?.id === cuenta.id) { this.cuentasModalOpen = false; this.tabMobile = 'carrito'; return; }
    this.cuentaActionBusy = true;
    try {
      if (!(await this.prepararCarritoParaCuenta())) return;
      const actual = await this.cuentasAbiertasService.get(cuenta.id);
      if (actual.estado !== 'abierta') throw new Error('ACCOUNT_NOT_OPEN');
      this.cargarCuentaEnCarrito(actual);
      this.cuentasModalOpen = false;
    } catch { await this.toastService.error('No se pudo abrir la cuenta. Puede haber sido cobrada o modificada. El carrito actual se conserva.'); }
    finally { this.cuentaActionBusy = false; }
  }

  private cargarCuentaEnCarrito(cuenta: CuentaAbierta, consumo: CuentaAbiertaConsumo = cuenta): void {
    this.resetFacturaActual();
    this.cuentaActiva = { ...cuenta, clienteNombre: consumo.clienteNombre, clienteId: consumo.clienteId };
    this.cartItems = consumo.items.map((item, index) => this.recalculateCartItem({ ...item,
      key: `${cuenta.id}-${index}`, stockActual: this.productos.find(p => p.id === item.productoServicioId)?.stockActual ?? item.stockActual ?? 0,
    }));
    this.selectedCliente = this.clientes.find(c => c.id === consumo.clienteId);
    this.facturaForm.patchValue({ clienteId: consumo.clienteId, descuentoGlobal: consumo.descuentoGlobal }, { emitEvent: false });
    this.tabMobile = 'carrito';
  }

  async guardarYSalirCuenta(): Promise<void> {
    if (this.isEmitting || this.cuentaActionBusy) return;
    this.cuentaActionBusy = true;
    try {
      if (!(await this.guardarCuentaActual())) return;
      this.resetFacturaActual();
      await this.abrirCuentas();
    } finally { this.cuentaActionBusy = false; }
  }

  async renombrarCuenta(): Promise<void> {
    if (!this.cuentaActiva || this.cuentaEdicionBloqueada) return;
    const alert = await this.alertCtrl.create({ header: 'Nombre de la cuenta',
      inputs: [{ name: 'nombre', type: 'text', value: this.cuentaActiva.clienteNombre, attributes: { maxlength: 120 } }],
      buttons: [{ text: 'Volver', role: 'cancel' }, { text: 'Guardar nombre', role: 'guardar' }],
    });
    await alert.present(); const result = await alert.onDidDismiss();
    const nombre = String(result.data?.values?.nombre || '').trim();
    if (result.role !== 'guardar' || !nombre || !this.cuentaActiva) return;
    this.selectedCliente = undefined;
    this.cuentaActiva = { ...this.cuentaActiva, clienteNombre: nombre, clienteId: '' };
    this.facturaForm.patchValue({ clienteId: '' }, { emitEvent: false });
    this.marcarCuentaModificada();
  }

  async imprimirPrecuenta(cuenta: CuentaAbierta | null = this.cuentaActiva): Promise<void> {
    if (!cuenta || this.cuentaEdicionBloqueada) return;
    this.cuentaActionBusy = true;
    let enviandoImpresion = false;
    try {
      if (this.cuentaActiva?.id === cuenta.id && !(await this.guardarCuentaActual())) return;
      const actual = await this.cuentasAbiertasService.get(cuenta.id);
      if (actual.estado !== 'abierta' || !actual.items.length) { await this.toastService.error('La precuenta requiere una cuenta abierta con consumos.'); return; }
      enviandoImpresion = true;
      await this.invoicePrintingService.printPrebill(actual);
    } catch (error) { await this.toastService.error(enviandoImpresion
      ? this.invoicePrintingService.getFriendlyError(error) : 'No se pudo recuperar la cuenta para imprimir. Verifica su estado y la conexión.'); }
    finally { this.cuentaActionBusy = false; }
  }

  async cancelarCuenta(cuenta: CuentaAbierta): Promise<void> {
    if (this.cuentaEdicionBloqueada) return;
    const alert = await this.alertCtrl.create({ header: 'Cancelar cuenta', message: `Se conservará la trazabilidad de la cuenta de ${cuenta.clienteNombre}. No se registrará una venta.`,
      inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo obligatorio' }],
      buttons: [{ text: 'Volver', role: 'cancel' }, { text: 'Cancelar cuenta', role: 'confirmar' }],
    });
    await alert.present(); const result = await alert.onDidDismiss();
    const motivo = String(result.data?.values?.motivo || '').trim();
    if (result.role !== 'confirmar') return;
    if (!motivo) { await this.toastService.error('Indica el motivo de cancelación.'); return; }
    this.cuentaActionBusy = true;
    try {
      if (this.cuentaActiva?.id === cuenta.id && !(await this.guardarCuentaActual())) return;
      const actual = this.cuentaActiva?.id === cuenta.id ? this.cuentaActiva : cuenta;
      await this.cuentasAbiertasService.cancelar(actual, motivo, this.cuentaUid);
      if (this.cuentaActiva?.id === cuenta.id) { this.borrarRecuperacionCuenta(); this.resetFacturaActual(); }
    } catch { await this.toastService.error('No se pudo cancelar. Recarga la cuenta; puede haber cambiado o sido cobrada.'); }
    finally { this.cuentaActionBusy = false; }
  }

  async recuperarConsumos(): Promise<void> {
    if (this.cuentaEdicionBloqueada) return;
    this.cuentaActionBusy = true;
    try {
      const raw = localStorage.getItem(this.recuperacionCuentaKey);
      if (!raw) return;
      const backup = JSON.parse(raw) as { cuenta: CuentaAbierta; consumo: CuentaAbiertaConsumo };
      if (this.cartItems.length || this.cuentaActiva) { await this.toastService.error('Guarda y sal del carrito actual antes de recuperar consumos pendientes.'); return; }
      const actual = await this.cuentasAbiertasService.get(backup.cuenta.id);
      this.cargarCuentaEnCarrito(actual, backup.consumo);
      this.cuentaPendiente = backup.consumo;
      this.cuentasModalOpen = false;
      if (actual.estado !== 'abierta' || actual.version !== backup.cuenta.version) {
        this.cuentaEstado = 'conflicto'; this.cuentaError = 'La cuenta del respaldo cambió en el servidor. Revisa y recarga antes de continuar.';
      } else await this.guardarCuentaActual();
    } catch { await this.toastService.error('No se pudieron recuperar los consumos. El respaldo local se conserva.'); }
    finally { this.cuentaActionBusy = false; }
  }

  async recargarCuenta(): Promise<void> {
    if (!this.cuentaActiva || this.isEmitting || this.cuentaActionBusy) return;
    const alert = await this.alertCtrl.create({ header: 'Recargar estado de la cuenta',
      message: 'Se descartarán los cambios locales pendientes y se cargará la última versión guardada. Si ya fue cobrada o cancelada, se liberará este carrito.',
      buttons: [{ text: 'Conservar cambios', role: 'cancel' }, { text: 'Descartar locales y recargar', role: 'recargar' }],
    });
    await alert.present(); if ((await alert.onDidDismiss()).role !== 'recargar') return;
    this.cuentaActionBusy = true;
    try {
      const actual = await this.cuentasAbiertasService.get(this.cuentaActiva.id);
      this.borrarRecuperacionCuenta();
      if (actual.estado === 'abierta') this.cargarCuentaEnCarrito(actual);
      else { this.resetFacturaActual(); await this.toastService.success(actual.facturaId ? `Cuenta facturada: ${actual.facturaId}` : 'Cuenta cancelada.'); }
    } catch { await this.toastService.error('No se pudo recargar. Tus cambios locales se conservan.'); }
    finally { this.cuentaActionBusy = false; }
  }

  readonly aperturaTurnoForm = this.fb.nonNullable.group({
    cajaId: ['principal', [Validators.required]],
    cajaNombre: ['Caja principal', [Validators.required]],
    montoInicial: [0, [Validators.required, Validators.min(0)]],
    observacionApertura: [''],
  });

  readonly cierreTurnoForm = this.fb.nonNullable.group({
    usarDesglose: [true],
    incluirFondoInicial: [false],
    cantidades: this.fb.nonNullable.array(DENOMINACIONES_DOP.map(() => this.fb.nonNullable.control(0,
      [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]))),
    efectivoContado: [0, [Validators.required, Validators.min(0)]],
    observacionCierre: [''],
  });

  readonly filtrosCatalogo = this.fb.nonNullable.group({
    busqueda: [''],
    tipo: ['todos'],
    categoria: ['todas'],
  });

  readonly facturaForm = this.fb.nonNullable.group({
    tipoComprobante: ['B02' as 'B01' | 'B02' | 'B14' | 'B15'],
    formaPago: ['efectivo' as 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto' | 'credito'],
    clienteId: [''],
    citaId: [''],
    descuentoGlobal: [0],
    origen: ['manual' as 'manual' | 'agenda'],
  });

  readonly quickClienteForm = this.fb.nonNullable.group({
    nombreCompleto: ['', [Validators.required]],
    telefono: ['', [Validators.required, Validators.minLength(7)]],
    correo: ['', [Validators.email]],
    rncCedula: [''],
    fechaNacimiento: [''],
    direccion: [''],
    rnc: [''],
  });

  readonly cobroForm = this.fb.nonNullable.group({
    montoPagado: [0, [Validators.required, Validators.min(0)]],
    efectivo: [0, [Validators.min(0)]],
    tarjeta: [0, [Validators.min(0)]],
    transferencia: [0, [Validators.min(0)]],
    credito: [0, [Validators.min(0)]],
  });

  private sub = new Subscription();
  private activeLoading?: HTMLIonLoadingElement;
  readonly canManageCompany$ = this.authService.userProfile$().pipe(
    map((profile) => {
      const role = String(profile?.rol || profile?.role || '').toLowerCase();
      return ['admin', 'superadmin', 'artist', 'artista'].includes(role);
    }),
  );

  constructor(
    private readonly fb: FormBuilder,
    private readonly productosService: ProductosServiciosService,
    private readonly facturacionService: FacturacionService,
    private readonly pdfFacturaService: PdfFacturaService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly agendaService: AgendaService,
    private readonly clientesService: ClientesService,
    private readonly cuentasPorCobrarService: CuentasPorCobrarService,
    private readonly route: ActivatedRoute,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly alertCtrl: AlertController,
    private readonly turnosCajaService: TurnosCajaService,
    private readonly loadingCtrl: LoadingController,
    private readonly invoicePrintingService: InvoicePrintingService,
    private readonly printerConfigurationService: PrinterConfigurationService,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly cuentasAbiertasService: CuentasAbiertasService,
  ) {}

  ngOnInit(): void {
    this.cargarCuentasAbiertas();
    this.sub.add(this.facturaForm.valueChanges.subscribe(() => this.marcarCuentaModificada()));
    this.initializePosTheme();
    void this.printerConfigurationService.load();
    this.sub.add(this.printerConfigurationService.configuration$.subscribe((configuration) => {
      this.printerConfiguration = configuration;
    }));
    this.sub.add(
      combineLatest([
        this.productosService.getProductosServicios(),
        this.agendaService.getCitas(),
        this.clientesService.getClientes(),
      ]).subscribe({
        next: ([productos, citas, clientes]) => {
          this.productos = (productos || []).filter((item) => item.activo);
          if (this.cuentaActiva) this.cartItems = this.cartItems.map(item => ({ ...item,
            stockActual: this.productos.find(p => p.id === item.productoServicioId)?.stockActual ?? item.stockActual,
          }));
          this.citas = citas || [];
          this.clientes = clientes || [];
          this.clientesFiltrados = [...this.clientes];
          this.applyCatalogFilters();
          this.loading = false;
          this.tryApplyAgendaContext();
          void this.cargarTurnoActivo();
        },
        error: async () => {
          this.loading = false;
          await this.toastService.error('No fue posible cargar módulo de facturación.');
        },
      }),
    );

    this.sub.add(this.filtrosCatalogo.valueChanges.subscribe(() => this.applyCatalogFilters()));
    this.cierreTurnoForm.controls.efectivoContado.disable({ emitEvent: false });
    this.sub.add(this.cierreTurnoForm.controls.usarDesglose.valueChanges.subscribe((usarDesglose) => {
      const { cantidades, efectivoContado } = this.cierreTurnoForm.controls;
      if (usarDesglose) {
        cantidades.enable({ emitEvent: false });
        efectivoContado.disable({ emitEvent: false });
      } else {
        cantidades.disable({ emitEvent: false });
        efectivoContado.enable({ emitEvent: false });
      }
    }));
  }

  ionViewDidEnter(): void {
    this.viewEntered = true;
    this.catalogFocusPending = true;
    this.focusCatalogSearchIfReady();
  }

  ionViewWillLeave(): void {
    if (this.cuentaActiva) void this.guardarCuentaActual();
    this.viewEntered = false;
    if (this.catalogFocusFrame !== undefined) cancelAnimationFrame(this.catalogFocusFrame);
    this.catalogFocusFrame = undefined;
    if (this.cartScrollFrame !== undefined) cancelAnimationFrame(this.cartScrollFrame);
    this.cartScrollFrame = undefined;
  }

  private focusCatalogSearchIfReady(): void {
    if (!this.viewEntered || !this.catalogFocusPending || !this.catalogSearch
      || this.loading || this.turnoLoading || this.facturacionBloqueadaPorTurno
      || this.catalogFocusFrame !== undefined) return;

    this.catalogFocusFrame = requestAnimationFrame(() => {
      this.catalogFocusFrame = undefined;
      if (!this.viewEntered || this.facturacionBloqueadaPorTurno || this.tabMobile !== 'catalogo'
        || this.activeLoading || this.cobroModalOpen || this.clienteSelectorModalOpen
        || this.citaSelectorModalOpen || this.quickClienteModalOpen || this.facturasModalOpen
        || this.showCierreTurnoModal || this.printerSettingsModalOpen || this.cuentasModalOpen) return;
      this.catalogFocusPending = false;
      void this.catalogSearch?.setFocus();
    });
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
    this.cartResizeObserver?.disconnect();
    this.sub.unsubscribe();
    this.document.body.classList.remove('facturacion-light-theme', 'facturacion-dark-theme');
  }

  get printerConfigurationLabel(): string {
    return this.printerConfigurationService.describe(this.printerConfiguration);
  }

  openPrinterSettings(): void {
    this.printerSettingsModalOpen = true;
  }

  closePrinterSettings(): void {
    this.printerSettingsModalOpen = false;
  }

  async onPrinterConfigurationSaved(configuration: PrinterConfiguration): Promise<void> {
    this.printerConfiguration = configuration;
    await this.toastService.success('Configuración de impresión guardada en esta caja.');
  }

  async imprimirFacturaConfigurada(factura: Factura): Promise<void> {
    try {
      await this.invoicePrintingService.print(factura);
      await this.toastService.success('Comprobante enviado a impresión.');
    } catch (error) {
      await this.presentPrintFailure(factura, error);
    }
  }

  private async tryPrintIssuedInvoice(factura: Factura): Promise<boolean> {
    try {
      await this.invoicePrintingService.print(factura);
      return true;
    } catch (error) {
      await this.presentPrintFailure(factura, error);
      return false;
    }
  }

  private async presentPrintFailure(factura: Factura, error: unknown): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Factura emitida, impresión pendiente',
      message: `${this.invoicePrintingService.getFriendlyError(error)} La venta ya fue registrada; reintentar no creará otra factura.`,
      buttons: [
        { text: 'Cerrar', role: 'cancel' },
        { text: 'Configurar', handler: () => this.openPrinterSettings() },
        { text: 'Reintentar', handler: () => void this.imprimirFacturaConfigurada(factura) },
      ],
    });
    await alert.present();
  }

  togglePosTheme(): void {
    this.posTheme = this.posTheme === 'light' ? 'dark' : 'light';
    this.applyPosTheme();
    try {
      this.document.defaultView?.localStorage.setItem('facturacion-theme', this.posTheme);
    } catch {
      // El tema sigue funcionando aunque el navegador bloquee almacenamiento local.
    }
  }

  private initializePosTheme(): void {
    try {
      const savedTheme = this.document.defaultView?.localStorage.getItem('facturacion-theme');
      this.posTheme = savedTheme === 'dark' ? 'dark' : 'light';
    } catch {
      this.posTheme = 'light';
    }
    this.applyPosTheme();
  }

  private applyPosTheme(): void {
    const body = this.document.body;
    body.classList.toggle('facturacion-dark-theme', this.posTheme === 'dark');
    body.classList.toggle('facturacion-light-theme', this.posTheme === 'light');
  }

  formatCurrency = formatCurrencyDOP;

  get categoriasDisponibles(): string[] {
    return Array.from(new Set(this.productos.map((item) => item.categoriaNombre).filter(Boolean))).sort();
  }

  get subtotal(): number {
    return this.cartItems.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
  }

  get descuentoGlobal(): number {
    return Number(this.facturaForm.value.descuentoGlobal || 0);
  }

  get itbisTotal(): number {
    return this.cartItems.reduce((acc, item) => acc + Number(item.itbis || 0), 0);
  }

  get total(): number {
    const v = Number(this.subtotal - this.descuentoGlobal + this.itbisTotal);
    return Number(v.toFixed(2));
  }

  get montoPagado(): number {
    return Number(this.cobroForm.value.montoPagado || 0);
  }

  get devueltaCobro(): number {
    return Number((this.montoPagado - this.total).toFixed(2));
  }

  get cambioCobro(): number {
    if (this.pagoDistribucion.credito > 0) return 0;
    return Number(Math.max(0, this.pagoDistribucion.totalPagadoAhora - this.total).toFixed(2));
  }

  get facturacionBloqueadaPorTurno(): boolean {
    return !this.turnoActivo || this.turnoActivo.estado !== 'abierto';
  }

  get efectivoEsperadoCierre(): number {
    const base = this.cierreTurnoForm.controls.incluirFondoInicial.value ? Number(this.turnoActivo?.montoInicial || 0) : 0;
    return Number((base + Number(this.turnoTotales.totalEfectivo || 0)).toFixed(2));
  }

  get diferenciaCierre(): number {
    const contado = this.totalContadoCierre;
    return Number((contado - this.efectivoEsperadoCierre).toFixed(2));
  }

  readonly denominacionesCierre = DENOMINACIONES_DOP;

  get desgloseCierre(): DesgloseEfectivo[] {
    return this.denominacionesCierre.map((denominacion, index) => ({
      denominacion, cantidad: Number(this.cierreTurnoForm.controls.cantidades.at(index).value || 0),
    }));
  }

  get totalContadoCierre(): number {
    return this.cierreTurnoForm.controls.usarDesglose.value
      ? this.desgloseCierre.reduce((total, item) => total + item.denominacion * item.cantidad, 0)
      : this.parseMoneyInput(this.cierreTurnoForm.controls.efectivoContado.value);
  }

  get montoPagadoDisplay(): string {
    return String(this.cobroForm.value.montoPagado ?? '');
  }

  get efectivoContadoDisplay(): string {
    return String(this.cierreTurnoForm.value.efectivoContado ?? '');
  }

  get pagoDistribucion() {
    const efectivo = this.parseMoneyInput(this.cobroForm.value.efectivo);
    const tarjeta = this.parseMoneyInput(this.cobroForm.value.tarjeta);
    const transferencia = this.parseMoneyInput(this.cobroForm.value.transferencia);
    const credito = this.parseMoneyInput(this.cobroForm.value.credito);
    const totalPagadoAhora = Number((efectivo + tarjeta + transferencia).toFixed(2));
    const totalRegistrado = Number((totalPagadoAhora + credito).toFixed(2));
    const diferencia = Number((this.total - totalRegistrado).toFixed(2));
    return { efectivo, tarjeta, transferencia, credito, totalPagadoAhora, totalRegistrado, diferencia };
  }

  get citaPrecioEstimadoActual(): number {
    return this.getCitaTotalEstimado(this.selectedCita);
  }

  get citaPagadoAnteriorActual(): number {
    return this.getCitaMontoPagado(this.selectedCita);
  }

  get citaMontoFacturarAhora(): number {
    return this.selectedCita ? this.getCitaMontoSegunModo(this.selectedCita, this.selectedCitaModo) : this.total;
  }

  get citaRestanteDespuesFactura(): number {
    if (!this.selectedCita) return 0;
    const restante = this.getCitaBalancePendiente(this.selectedCita) - this.pagoDistribucion.totalPagadoAhora;
    return Number(Math.max(0, restante).toFixed(2));
  }

  get esPagoMixtoConCredito(): boolean {
    const formaPago = this.facturaForm.value.formaPago;
    return formaPago === 'mixto' || formaPago === 'credito';
  }

  get productosTotalPages(): number {
    return Math.max(1, Math.ceil(this.productosFiltrados.length / this.productosPageSize));
  }

  get productosPaginados(): ProductoServicio[] {
    const start = (this.productosPage - 1) * this.productosPageSize;
    return this.productosFiltrados.slice(start, start + this.productosPageSize);
  }

  get facturasModalTitle(): string {
    return this.facturasModalEstado === 'emitida' ? 'Facturas emitidas' : 'Borradores';
  }

  get facturasModalDateLabel(): string {
    if (!this.facturasFechaDesde || !this.facturasFechaHasta) return 'Selecciona un rango de fechas';
    const formatter = new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' });
    const desde = formatter.format(new Date(`${this.facturasFechaDesde}T00:00:00`));
    const hasta = formatter.format(new Date(`${this.facturasFechaHasta}T00:00:00`));
    return this.facturasFechaDesde === this.facturasFechaHasta ? desde : `${desde} – ${hasta}`;
  }

  get facturasModalTotalPages(): number {
    return Math.max(1, Math.ceil(this.facturasDelDia.length / this.facturasModalPageSize));
  }

  get facturasModalPaginadas(): Factura[] {
    const start = (this.facturasModalPage - 1) * this.facturasModalPageSize;
    return this.facturasDelDia.slice(start, start + this.facturasModalPageSize);
  }

  onCatalogSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || this.loading || this.isEmitting) return;

    // El lector actúa como teclado. Lee el valor nativo para no depender del
    // orden entre ionInput, el formulario reactivo y la tecla final del lector.
    const input = event.composedPath().find((target) => target instanceof HTMLInputElement) as HTMLInputElement | undefined;
    const code = String(input?.value ?? this.filtrosCatalogo.controls.busqueda.value).trim();
    if (!code) return;

    const normalizedCode = code.toUpperCase();
    const matches = this.productos.filter((producto) => producto.activo
      && String(producto.codigoInterno || '').trim().toUpperCase() === normalizedCode);

    // Limpiar de forma síncrona mantiene el foco y permite escanear el mismo
    // código consecutivamente sin mezclarlo con el escaneo anterior.
    this.filtrosCatalogo.controls.busqueda.setValue('');
    if (input) input.value = '';
    this.applyCatalogFilters();

    if (!matches.length) {
      void this.toastService.warning(`No hay un producto activo con el código ${code}. Verifica el código o regístralo en inventario.`, 'Producto no encontrado');
      return;
    }
    if (matches.length > 1) {
      void this.toastService.warning(`El código ${code} pertenece a varios productos. Revisa los códigos en inventario.`, 'Código duplicado');
      return;
    }
    this.addProductoToCart(matches[0]);
  }

  private shortcutOverlayActive(): boolean {
    return !!this.document.querySelector('ion-alert:not(.overlay-hidden), ion-action-sheet:not(.overlay-hidden), ion-popover:not(.overlay-hidden), ion-loading:not(.overlay-hidden)');
  }

  @HostListener('document:keydown', ['$event'])
  onVentaKeydown(event: KeyboardEvent): void {
    if (event.key !== ' ' || event.defaultPrevented || event.isComposing || event.repeat
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !this.viewEntered
      || this.loading || this.isEmitting || this.cobroSubmitting || this.turnoLoading || this.turnoActionLoading
      || this.cuentaEdicionBloqueada || this.facturacionBloqueadaPorTurno || !this.cartItems.length
      || this.cobroModalOpen || this.clienteSelectorModalOpen || this.citaSelectorModalOpen || this.quickClienteModalOpen
      || this.facturasModalOpen || this.cuentasModalOpen || this.showCierreTurnoModal || this.printerSettingsModalOpen
      || this.activeLoading || this.shortcutOverlayActive()) return;
    const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (path.some(node => node.matches('button, ion-button, a, ion-select, ion-toggle, [role="button"], [role="combobox"]'))) return;
    const input = path.find(node => node.matches('input, textarea, select, ion-input, ion-textarea, [contenteditable="true"], [role="textbox"]'));
    // El catálogo recibe el foco por defecto. Un Espacio con su búsqueda vacía
    // funciona como atajo; al escribir nombres o códigos conserva el espacio.
    const emptyCatalog = path.some(node => node.hasAttribute('data-pos-catalog-search'))
      && !String(path.find(node => node instanceof HTMLInputElement)?.['value'] ?? this.filtrosCatalogo.controls.busqueda.value).trim();
    if (input && !emptyCatalog) return;
    event.preventDefault();
    event.stopPropagation();
    this.openCobroModal();
  }

  onCobroKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
    // Conservar la activación accesible de botones y controles desplegables.
    if (path.some(node => node.matches('button, ion-button, a, textarea, ion-textarea, ion-select, [role="button"], [role="combobox"]'))) return;
    event.preventDefault();
    event.stopPropagation(); // Evita el submit implícito adicional del formulario.
    if (event.repeat || !this.viewEntered || !this.cobroModalOpen || !this.cobroKeyboardReady
      || this.isEmitting || this.cobroSubmitting || this.cuentaEdicionBloqueada || this.turnoActionLoading
      || this.activeLoading || this.shortcutOverlayActive()) return;
    void this.confirmarCobroYEmitir(false);
  }

  addProductoToCart(producto: ProductoServicio): void {
    if (this.cuentaEdicionBloqueada) return;
    if (!producto.activo) return;
    if (this.getStockStatus(producto) === 'sin-stock') {
      void this.toastService.error('Producto sin stock disponible.');
      return;
    }

    const key = producto.id || producto.codigoInterno || `${Date.now()}`;
    const found = this.cartItems.find((item) => item.key === key
      || (!!producto.id && item.productoServicioId === producto.id));
    if (found) {
      const previousQuantity = found.cantidad;
      this.updateQuantity(found, found.cantidad + 1);
      if (found.cantidad > previousQuantity) {
        this.showLastAddedCartItem(found.key);
        this.catalogFocusPending = true;
        this.focusCatalogSearchIfReady();
      }
      return;
    }

    const base: PosCartItem = {
      key,
      productoServicioId: producto.id,
      codigo: producto.codigoInterno,
      descripcion: producto.nombre,
      tipo: producto.tipoItem === 'servicio' ? 'servicio' : 'producto',
      cantidad: 1,
      precioUnitario: Number(producto.precioVenta || 0),
      costoUnitario: Number(producto.precioCompra || producto.ultimoCosto || 0),
      descuento: 0,
      aplicaItbis: this.productoAplicaItbis(producto),
      porcentajeItbis: Number(producto.tasaItbis || 0),
      subtotal: 0,
      itbis: 0,
      total: 0,
      categoria: producto.categoriaNombre,
      manejaInventario: !!producto.manejaInventario,
      stockActual: this.toNumber(producto.stockActual),
    };

    this.cartItems = [...this.cartItems, this.recalculateCartItem(base)];
    this.marcarCuentaModificada();
    this.showLastAddedCartItem(key);
    this.catalogFocusPending = true;
    this.focusCatalogSearchIfReady();
  }

  updateQuantity(item: PosCartItem, qty: number): void {
    if (this.cuentaEdicionBloqueada) return;
    const quantity = Math.max(1, Number(qty || 1));
    if (!Number.isFinite(quantity)) return;
    if (item.manejaInventario && quantity > Number(item.stockActual || 0)) {
      void this.toastService.error('Cantidad supera stock disponible.');
      return;
    }
    item.cantidad = quantity;
    this.patchCartItem(item);
  }

  trackByCartItem(_: number, item: PosCartItem): string {
    return item.key;
  }

  onCartQuantityInput(item: PosCartItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.value.trim()) return; // Permitir borrar el valor antes de reescribir.
    const quantity = Number(input.value);
    if (!Number.isFinite(quantity) || quantity < 1) return;
    this.updateQuantity(item, quantity);
  }

  onCartQuantityBlur(item: PosCartItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const current = this.cartItems.find(row => row.key === item.key);
    input.value = String(current?.cantidad ?? item.cantidad);
  }

  updateDiscount(item: PosCartItem, discount: number): void {
    if (this.cuentaEdicionBloqueada) return;
    item.descuento = Math.max(0, Number(discount || 0));
    this.patchCartItem(item);
  }

  removeCartItem(item: PosCartItem): void {
    if (this.cuentaEdicionBloqueada) return;
    this.cartItems = this.cartItems.filter((current) => current.key !== item.key);
    this.marcarCuentaModificada();
  }

  selectCliente(clienteId: string): void {
    if (this.cuentaEdicionBloqueada) return;
    this.selectedCliente = this.clientes.find((c) => c.id === clienteId);
    this.facturaForm.patchValue({ clienteId });
  }

  openClienteSelectorModal(): void {
    this.clienteSelectorModalOpen = true;
    this.filtrarClientes('');
  }

  closeClienteSelectorModal(): void {
    this.clienteSelectorModalOpen = false;
  }

  onClienteSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.filtrarClientes(String(target?.value || ''));
  }

  filtrarClientes(term: string): void {
    const q = this.normalizeText(term);
    this.clienteSearchTerm = term;
    if (!q) {
      this.clientesFiltrados = [...this.clientes];
      return;
    }

    this.clientesFiltrados = this.clientes.filter((cliente) => {
      const nombre = this.normalizeText((cliente as any).nombreCompleto || (cliente as any).nombre || '');
      const cedula = this.normalizeText((cliente as any).rnc || (cliente as any).rncCedula || (cliente as any).cedula || '');
      const telefono = this.normalizeText((cliente as any).telefono || (cliente as any).numero || '');
      const correo = this.normalizeText((cliente as any).correo || '');

      return nombre.includes(q)
        || cedula.includes(q)
        || telefono.includes(q)
        || correo.includes(q);
    });
  }

  selectClienteFromModal(cliente: Cliente): void {
    if (!cliente.id) return;
    this.selectCliente(cliente.id);
    this.closeClienteSelectorModal();
  }

  selectConsumidorFinal(): void {
    if (this.cuentaEdicionBloqueada) return;
    this.selectedCliente = undefined;
    this.facturaForm.patchValue({ clienteId: '' });
    this.closeClienteSelectorModal();
  }

  selectCita(citaId: string, mode: 'abono' | 'total' | 'pendiente' = this.selectedCitaModo): void {
    if (this.cuentaActiva) { void this.toastService.error('Guarda y sal de la cuenta antes de facturar una cita.'); return; }
    this.selectedCita = this.citas.find((c) => c.id === citaId);
    this.facturaForm.patchValue({ citaId });
    if (!this.selectedCita) return;
    this.selectedCitaModo = mode;

    if (this.selectedCita.clienteId) {
      this.selectCliente(this.selectedCita.clienteId);
    }

    this.removeCitaCartItems();
    const citaTotal = this.getCitaMontoSegunModo(this.selectedCita, mode);
    const itbisPct = Number(this.selectedCita.itbisPorcentaje ?? 18);
    const divisor = itbisPct > 0 ? (1 + (itbisPct / 100)) : 1;
    const precioBase = itbisPct > 0
      ? Number((citaTotal / divisor).toFixed(2))
      : Number(citaTotal.toFixed(2));
    const servicio = {
      key: `cita-${this.selectedCita.id}`,
      descripcion: this.selectedCita.servicioNombre || this.selectedCita.descripcionTrabajo || 'Servicio de tatuaje',
      tipo: 'servicio' as const,
      cantidad: 1,
      precioUnitario: precioBase,
      descuento: 0,
      aplicaItbis: itbisPct > 0,
      porcentajeItbis: itbisPct,
      subtotal: 0,
      itbis: 0,
      total: 0,
      manejaInventario: false,
    };

    this.cartItems = [...this.cartItems, this.recalculateCartItem(servicio)];
    this.facturaForm.patchValue({ origen: 'agenda' });
  }

  openCitaSelectorModal(): void {
    this.citaSelectorModalOpen = true;
  }

  closeCitaSelectorModal(): void {
    this.citaSelectorModalOpen = false;
  }

  onCitaSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.citaSearchTerm = String(target?.value || '');
  }

  clearCitaFilters(): void {
    this.citaSearchTerm = '';
    this.citaFechaDesde = '';
    this.citaFechaHasta = '';
  }

  selectCitaFromModal(citaId: string): void {
    this.selectCita(citaId, 'total');
    this.closeCitaSelectorModal();
  }

  selectCitaConModo(citaId: string, mode: 'abono' | 'total' | 'pendiente'): void {
    this.selectCita(citaId, mode);
    this.closeCitaSelectorModal();
  }

  clearCitaSelection(): void {
    this.selectedCita = undefined;
    this.selectedCitaModo = 'total';
    this.removeCitaCartItems();
    this.facturaForm.patchValue({ citaId: '', origen: 'manual' });
    this.closeCitaSelectorModal();
  }

  get citasFiltradas(): Cita[] {
    const q = this.normalizeText(this.citaSearchTerm);
    const fromTs = this.citaFechaDesde ? new Date(`${this.citaFechaDesde}T00:00:00`).getTime() : undefined;
    const toTs = this.citaFechaHasta ? new Date(`${this.citaFechaHasta}T23:59:59`).getTime() : undefined;

    return this.citas.filter((cita) => {
      const matchesText = !q || [
        cita.clienteNombre,
        cita.servicioNombre,
        cita.artistaNombre,
        cita.descripcionTrabajo,
      ].some((v) => this.normalizeText(v).includes(q));

      const citaTs = this.toTime(cita.fecha);
      const matchesFrom = fromTs === undefined || (citaTs !== undefined && citaTs >= fromTs);
      const matchesTo = toTs === undefined || (citaTs !== undefined && citaTs <= toTs);

      return matchesText && matchesFrom && matchesTo;
    });
  }

  formatCitaFecha(cita: Cita): string {
    const ts = this.toTime(cita.fecha);
    if (!ts) return String(cita.fecha || 'Sin fecha');
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  }

  getCitaTotalEstimado(cita?: Cita): number {
    if (!cita) return 0;
    const totalConItbis = this.toNumber(cita.totalConItbis);
    if (totalConItbis > 0) return totalConItbis;
    const precio = this.toNumber(cita.precioEstimado);
    const itbis = this.toNumber(cita.itbisPorcentaje);
    return Number((precio + (precio * (itbis / 100))).toFixed(2));
  }

  getCitaMontoPagado(cita?: Cita): number {
    return Number(this.toNumber(cita?.montoPagado).toFixed(2));
  }

  getCitaBalancePendiente(cita?: Cita): number {
    if (!cita) return 0;
    const explicit = this.toNumber(cita.balancePendiente);
    if (explicit > 0) return Number(explicit.toFixed(2));
    const total = this.getCitaTotalEstimado(cita);
    const pagado = this.getCitaMontoPagado(cita);
    return Number(Math.max(0, total - pagado).toFixed(2));
  }

  getCitaMontoSegunModo(cita: Cita, mode: 'abono' | 'total' | 'pendiente'): number {
    const pendiente = this.getCitaBalancePendiente(cita);
    if (mode === 'pendiente') return pendiente;
    if (mode === 'abono') {
      const sugerido = this.toNumber(cita.montoAbonoSugerido);
      if (sugerido > 0) return Number(Math.min(sugerido, pendiente || sugerido).toFixed(2));
      return pendiente;
    }
    return pendiente > 0 ? pendiente : this.getCitaTotalEstimado(cita);
  }

  getCitaEstadoPagoLabel(cita: Cita): string {
    const estado = String(cita.estadoPago || 'sin_pago');
    if (estado === 'pagada') return 'Pagada';
    if (estado === 'parcial') return 'Parcial';
    return 'Sin pago';
  }

  getCitaEstadoPagoClass(cita: Cita): string {
    const estado = String(cita.estadoPago || 'sin_pago');
    if (estado === 'pagada') return 'cita-payment-badge cita-payment-badge--success';
    if (estado === 'parcial') return 'cita-payment-badge cita-payment-badge--warning';
    return 'cita-payment-badge cita-payment-badge--danger';
  }

  openQuickClienteModal(): void {
    this.quickClienteForm.reset({
      nombreCompleto: '',
      telefono: '',
      correo: '',
      rncCedula: '',
      fechaNacimiento: '',
      direccion: '',
      rnc: '',
    });

    if (this.clienteSelectorModalOpen) {
      this.openQuickClienteAfterSelectorDismiss = true;
      this.clienteSelectorModalOpen = false;
      return;
    }

    this.quickClienteModalOpen = true;
  }

  closeQuickClienteModal(): void {
    this.quickClienteModalOpen = false;
  }

  onClienteSelectorModalDidDismiss(): void {
    this.clienteSelectorModalOpen = false;
    if (!this.openQuickClienteAfterSelectorDismiss) return;
    this.openQuickClienteAfterSelectorDismiss = false;
    this.quickClienteModalOpen = true;
  }

  get quickTelefonoExistente(): Cliente | undefined {
    const telefono = String(this.quickClienteForm.value.telefono || '').replace(/\D/g, '');
    if (!telefono) return undefined;
    return this.clientes.find((c) => String(c.telefono || '').replace(/\D/g, '') === telefono);
  }

  seleccionarClienteExistenteDesdeQuick(): void {
    const cliente = this.quickTelefonoExistente;
    if (!cliente?.id) return;
    this.closeQuickClienteModal();
    this.selectCliente(cliente.id);
    this.clienteSelectorModalOpen = false;
  }

  async saveQuickCliente(): Promise<void> {
    if (this.quickClienteForm.invalid) {
      this.quickClienteForm.markAllAsTouched();
      await this.toastService.error('Ingresa nombre y teléfono del cliente.');
      return;
    }

    const raw = this.quickClienteForm.getRawValue();
    const doc = String(raw.rncCedula || '').replace(/\D/g, '');
    const rnc = String(raw.rnc || '').replace(/\D/g, '');
    if (doc && doc.length !== 9 && doc.length !== 11) {
      await this.toastService.error('RNC/Cédula inválido. Debe tener 9 o 11 dígitos.');
      return;
    }

    if (rnc && rnc.length !== 9) {
      await this.toastService.error('El RNC debe tener 9 dígitos.');
      return;
    }

    if (raw.rncCedula?.trim() && await this.clientesService.existsClienteRncCedula(raw.rncCedula.trim())) {
      await this.toastService.error('Ya existe un cliente con esa cédula/RNC.');
      return;
    }

    if (raw.rnc?.trim() && await this.clientesService.existsClienteRncCedula(raw.rnc.trim())) {
      await this.toastService.error('Ya existe un cliente con ese RNC.');
      return;
    }

    if (raw.telefono?.trim() && await this.clientesService.existsClienteTelefono(raw.telefono.trim())) {
      await this.toastService.error('Ya existe un cliente con ese teléfono.');
      return;
    }

    try {
      await this.showLoading('Creando cliente...', 'Preparando información para la factura.');
      const id = await this.clientesService.createCliente({
        nombreCompleto: raw.nombreCompleto.trim(),
        telefono: raw.telefono?.trim() || undefined,
        correo: raw.correo?.trim() || undefined,
        rncCedula: raw.rncCedula?.trim() || undefined,
        fechaNacimiento: raw.fechaNacimiento || undefined,
        direccion: raw.direccion?.trim() || undefined,
        rnc: raw.rnc?.trim() || undefined,
        activo: true,
        creadoEn: new Date().toISOString(),
      } as any);
      this.closeQuickClienteModal();
      this.selectCliente(id);
      this.clienteSelectorModalOpen = false;
      await this.toastService.success('Cliente creado correctamente. Cliente seleccionado para la factura.');
    } catch (error) {
      console.error('[Facturacion] saveQuickCliente error:', error);
      await this.showErrorAlert('No pudimos crear el cliente.', 'Verifica la información e intenta nuevamente.');
    } finally {
      await this.dismissLoading();
    }
  }

  getStockStatus(item: ProductoServicio): 'sin-stock' | 'disponible' | 'servicio' {
    if (item?.tipoItem === 'servicio') return 'servicio';
    if (!item?.manejaInventario) return 'disponible';
    const stock = this.toNumber(item?.stockActual);
    return stock > 0 ? 'disponible' : 'sin-stock';
  }

  getStockLabel(item: ProductoServicio): string {
    const status = this.getStockStatus(item);
    if (status === 'servicio') return 'No requiere stock';
    if (status === 'disponible') return `Disponible: ${this.toNumber(item?.stockActual)}`;
    return 'Sin stock';
  }

  getStockClass(item: ProductoServicio): string {
    const status = this.getStockStatus(item);
    if (status === 'sin-stock') return 'stock-badge--danger';
    if (status === 'disponible') return 'stock-badge--success';
    return 'stock-badge--neutral';
  }

  canAddProducto(item: ProductoServicio): boolean {
    return this.getStockStatus(item) !== 'sin-stock';
  }

  setCatalogStockFilter(filter: 'todos' | 'disponibles'): void {
    this.catalogStockFilter = filter;
    this.applyCatalogFilters();
  }

  openCobroModal(): void {
    if (this.cobroModalOpen || this.cobroSubmitting) return;
    if (this.cuentaEdicionBloqueada || (this.cuentaActiva && this.cuentaEstado === 'error')) return;
    if (this.facturacionBloqueadaPorTurno) {
      void this.showConfirmTurnoRequired();
      return;
    }
    if (!this.cartItems.length) {
      void this.toastService.error('Agrega productos o servicios antes de emitir.');
      return;
    }
    const total = Number(this.total || 0);
    const formaPago = this.facturaForm.value.formaPago;
    this.cobroForm.patchValue({
      montoPagado: total,
      efectivo: formaPago === 'efectivo' ? total : 0,
      tarjeta: formaPago === 'tarjeta' ? total : 0,
      transferencia: formaPago === 'transferencia' ? total : 0,
      credito: formaPago === 'credito' ? total : 0,
    });
    this.cobroKeyboardReady = false;
    this.cobroModalOpen = true;
  }

  closeCobroModal(): void {
    this.cobroModalOpen = false;
    this.cobroKeyboardReady = false;
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
    normalized = normalized.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  onMontoPagadoInput(event: Event): void {
    const raw = String((event as CustomEvent).detail?.value ?? '');
    const parsed = this.parseMoneyInput(raw);
    this.cobroForm.patchValue({ montoPagado: parsed }, { emitEvent: false });
    if (!this.esPagoMixtoConCredito) {
      this.syncSimplePaymentWithFormaPago(parsed);
    }
  }

  onMontoPagadoBlur(): void {
    const parsed = this.parseMoneyInput(this.cobroForm.value.montoPagado);
    this.cobroForm.patchValue({ montoPagado: parsed }, { emitEvent: false });
    if (!this.esPagoMixtoConCredito) {
      this.syncSimplePaymentWithFormaPago(parsed);
    }
  }

  onEfectivoContadoInput(event: Event): void {
    const raw = String((event as CustomEvent).detail?.value ?? '');
    this.cierreTurnoForm.patchValue({ efectivoContado: this.parseMoneyInput(raw) }, { emitEvent: true });
  }

  onEfectivoContadoBlur(): void {
    const parsed = this.parseMoneyInput(this.cierreTurnoForm.value.efectivoContado);
    this.cierreTurnoForm.patchValue({ efectivoContado: parsed }, { emitEvent: false });
  }

  onDistribucionInput(field: 'efectivo' | 'tarjeta' | 'transferencia' | 'credito', event: Event): void {
    const raw = String((event as CustomEvent).detail?.value ?? '');
    this.cobroForm.patchValue({ [field]: this.parseMoneyInput(raw) }, { emitEvent: false });
  }

  private syncSimplePaymentWithFormaPago(totalAmount: number): void {
    const formaPago = this.facturaForm.value.formaPago;
    this.cobroForm.patchValue({
      efectivo: formaPago === 'efectivo' ? totalAmount : 0,
      tarjeta: formaPago === 'tarjeta' ? totalAmount : 0,
      transferencia: formaPago === 'transferencia' ? totalAmount : 0,
      credito: formaPago === 'credito' ? totalAmount : 0,
    }, { emitEvent: false });
  }

  async confirmarCobroYEmitir(imprimir = false): Promise<void> {
    if (this.isEmitting || this.cobroSubmitting) return;
    this.cobroSubmitting = true;
    try {
      const pago = this.pagoDistribucion;
      if (pago.credito <= 0 && pago.totalRegistrado < this.total) {
        await this.toastService.error('Sin crédito, el pago debe cubrir el total de la factura.');
        return;
      }
      if (pago.credito > 0 && Number(pago.diferencia.toFixed(2)) !== 0) {
        await this.toastService.error('La distribución con crédito debe cubrir exactamente el total.');
        return;
      }
      let pagoAplicado;
      try { pagoAplicado = this.normalizePaymentAppliedToInvoice(pago); }
      catch {
        await this.toastService.error('El exceso de pago solo puede devolverse del efectivo recibido. Revisa los importes de tarjeta y transferencia.');
        return;
      }
      await this.emitirFactura(pago.totalPagadoAhora, imprimir, pagoAplicado);
    } finally {
      this.cobroSubmitting = false;
    }
  }

  private normalizePaymentAppliedToInvoice(pago: {
    efectivo: number;
    tarjeta: number;
    transferencia: number;
    credito: number;
    totalPagadoAhora: number;
    totalRegistrado: number;
    diferencia: number;
  }): any {
    return aplicarPagoAFactura(pago, this.total);
  }

  private formatNumberAmount(value: number): string {
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  formatTurnoApertura(value: any): string {
    const iso = this.toIsoDate(value);
    if (!iso) return '--:--';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '--:--';
    return new Intl.DateTimeFormat('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }

  async emitirFactura(montoPagado?: number, imprimir = false, pagosBreakdown?: any): Promise<void> {
    if (this.isEmitting) return;

    if (!this.cartItems.length) {
      await this.toastService.error('Agrega productos o servicios antes de emitir.');
      return;
    }
    if (!(await this.ensureTurnoActivo())) return;
    if (!this.isOnline()) {
      await this.showOfflineAlert(() => this.emitirFactura(montoPagado, imprimir, pagosBreakdown), 'emitir la factura y guardar la venta correctamente');
      return;
    }

    // La validación del turno es asíncrona: volver a comprobar el bloqueo
    // antes de iniciar para cubrir pulsaciones simultáneas durante esa espera.
    if (this.isEmitting) return;
    const paid = Number(montoPagado ?? this.total);
    let cuentaFacturaConfirmada = '';

    try {
      this.isEmitting = true;
      await this.showLoading('Emitiendo factura...', 'Estamos registrando la venta y preparando el comprobante.');
      if (this.cuentaActiva && !(await this.guardarCuentaActual())) return;
      await this.facturacionService.validarStockItems(this.cartItems);
      const user = await firstValueFrom(this.authService.user$);
      const payload = this.buildFacturaPayload(user?.uid || 'sistema', 'emitida', paid, pagosBreakdown);
      const facturaId = await this.facturacionService.emitirFactura(payload as any);
      if (payload.cuentaAbiertaId) cuentaFacturaConfirmada = facturaId;
      if ((payload.pagos?.totalCredito || 0) > 0 && !payload.citaId && !payload.cuentaAbiertaId) {
        try {
          await this.facturacionService.createCuentaPorCobrarFromFactura(facturaId, payload as Factura, user?.uid || 'sistema');
        } catch (cxError) {
          console.error('[Facturacion] cuenta por cobrar no creada:', cxError);
          await this.toastService.error('Factura emitida, pero no se pudo crear la cuenta por cobrar. Verifica permisos o conexión.');
        }
      }
      // El cobro de una cuenta ya se confirmó en la transacción. Liberar el
      // carrito antes de tareas de presentación que puedan fallar por conexión.
      if (payload.cuentaAbiertaId) {
        this.borrarRecuperacionCuenta();
        this.resetFacturaActual();
      }
      const factura = await this.fetchFacturaByIdWithRetry(facturaId);
      const facturaFinal = factura || ({ ...payload, id: facturaId, numero: payload.numeroFactura || `FACT-${facturaId.slice(0, 6).toUpperCase()}` } as Factura);
      await this.syncCitaAfterFactura(facturaFinal, facturaId, user?.uid || 'sistema');

      this.resetFacturaActual();
      const shouldPrint = imprimir || Boolean(this.printerConfiguration?.autoPrintAfterInvoice);
      if (shouldPrint) {
        await this.dismissLoading();
        await this.tryPrintIssuedInvoice(facturaFinal);
      }

      if (factura && !imprimir) {
        await this.presentPostEmitActions(factura);
      }
      await this.showSuccessToast(
        (payload.pagos?.totalCredito || 0) > 0
          ? 'Factura emitida con saldo pendiente.'
          : 'Factura emitida. La venta fue registrada correctamente.',
      );
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (cuentaFacturaConfirmada) {
        await this.toastService.error(`La factura ${cuentaFacturaConfirmada} quedó registrada y la cuenta cerrada. Consulta las facturas para imprimirla; no vuelvas a cobrar.`);
        return;
      }
      if (message === 'ACCOUNT_CONFLICT' || message === 'ACCOUNT_NOT_OPEN') {
        this.cuentaEstado = 'conflicto';
        this.cuentaError = 'La cuenta cambió o ya fue cobrada/cancelada. Recarga su estado antes de continuar.';
        await this.toastService.error(this.cuentaError);
        return;
      }
      if (message.startsWith('INSUFFICIENT_STOCK')) {
        await this.toastService.error('Stock insuficiente en uno de los productos.');
        return;
      }
      if (message === 'INVALID_RNC_CEDULA') {
        await this.toastService.error('RNC/Cédula inválido para la emisión fiscal.');
        return;
      }
      console.error('[Facturacion] emitirFactura error:', error);
      await this.showErrorAlert('No pudimos emitir la factura', 'La venta no fue completada. Revisa la información e intenta nuevamente.');
    } finally {
      await this.dismissLoading();
      this.isEmitting = false;
    }
  }

  async guardarBorrador(): Promise<void> {
    if (this.cuentaActiva) { await this.guardarCuentaActual(); return; }
    if (!this.cartItems.length) {
      await this.toastService.error('Agrega ítems para guardar borrador.');
      return;
    }
    if (!(await this.ensureTurnoActivo())) return;

    try {
      const user = await firstValueFrom(this.authService.user$);
      const facturaId = await this.facturacionService.createFactura(this.buildFacturaPayload(user?.uid || 'sistema', 'borrador') as any);
      const factura = await firstValueFrom(this.facturacionService.getFacturaById(facturaId));
      if (factura) {
        await this.presentPostSaveActions(factura);
      }
      this.resetFacturaActual();
      await this.toastService.success('Factura guardada como borrador.');
    } catch (error) {
      console.error('[Facturacion] guardarBorrador error:', error);
      await this.toastService.error('No fue posible guardar el borrador.');
    }
  }

  async anularFactura(factura: Factura): Promise<void> {
    if (!factura.id || factura.estado === 'anulada') return;
    const alert = await this.alertCtrl.create({
      header: 'Anular factura',
      message: 'Esta acción anulará la factura y reversará el inventario asociado.',
      inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo (opcional)' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async (value) => {
            await this.facturacionService.anularFactura(factura.id as string, String(value.motivo || ''));
            await this.toastService.success('Factura anulada.');
          },
        },
      ],
    });
    await alert.present();
  }

  async openFacturaActions(factura: Factura): Promise<void> {
    const extraButtons = factura.estado === 'borrador'
      ? [{ text: 'Emitir borrador', icon: 'checkmark-circle-outline', handler: () => this.emitirBorrador(factura) }]
      : [];
    const actions = await this.actionSheetCtrl.create({
      header: `Factura ${factura.numero}`,
      buttons: [
        ...extraButtons,
        { text: `Imprimir (${this.printerConfigurationLabel})`, icon: 'print-outline', handler: () => void this.imprimirFacturaConfigurada(factura) },
        { text: 'Guardar PDF', icon: 'download-outline', handler: () => this.pdfFacturaService.generarFacturaPdf(factura) },
        { text: 'Ver preview', icon: 'eye-outline', handler: () => this.pdfFacturaService.abrirPreview(factura) },
        { text: 'Anular factura', icon: 'ban-outline', role: 'destructive', handler: () => this.anularFactura(factura) },
        { text: 'Cerrar', role: 'cancel', icon: 'close-outline' },
      ],
    });
    await actions.present();
  }

  abrirPdfFactura(factura: Factura): void {
    this.pdfFacturaService.abrirFacturaPdf(factura);
  }

  imprimirTicketFactura(factura: Factura): void {
    void this.imprimirFacturaConfigurada(factura);
  }

  openFacturasActionsPopover(event: Event, factura: Factura): void {
    this.selectedFacturaAction = factura;
    this.facturasActionsEvent = event;
    this.facturasActionsPopoverOpen = true;
  }

  closeFacturasActionsPopover(): void {
    this.facturasActionsPopoverOpen = false;
    this.facturasActionsEvent = undefined;
    this.selectedFacturaAction = undefined;
  }

  popoverVerDetalle(): void {
    if (!this.selectedFacturaAction) return;
    void this.openFacturaActions(this.selectedFacturaAction);
    this.closeFacturasActionsPopover();
  }

  popoverAbrirPdf(): void {
    if (!this.selectedFacturaAction) return;
    this.abrirPdfFactura(this.selectedFacturaAction);
    this.closeFacturasActionsPopover();
  }

  popoverImprimirTicket(): void {
    if (!this.selectedFacturaAction) return;
    this.imprimirTicketFactura(this.selectedFacturaAction);
    this.closeFacturasActionsPopover();
  }

  popoverContinuarBorrador(): void {
    if (!this.selectedFacturaAction) return;
    this.continuarBorrador(this.selectedFacturaAction);
    this.closeFacturasActionsPopover();
  }

  async popoverAnularFactura(): Promise<void> {
    if (!this.selectedFacturaAction) return;
    await this.anularFactura(this.selectedFacturaAction);
    this.closeFacturasActionsPopover();
  }

  async emitirBorrador(factura: Factura): Promise<void> {
    if (!factura.id || factura.estado !== 'borrador') return;
    try {
      await this.facturacionService.emitirFacturaBorrador(factura.id);
      const facturaEmitida = await firstValueFrom(this.facturacionService.getFacturaById(factura.id));
      if (facturaEmitida) {
        await this.presentPostEmitActions(facturaEmitida);
      }
      await this.toastService.success('Factura borrador emitida correctamente.');
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (message.startsWith('INSUFFICIENT_STOCK')) {
        await this.toastService.error('Stock insuficiente para emitir el borrador.');
        return;
      }
      await this.toastService.error('No fue posible emitir el borrador.');
    }
  }

  goProductosPrevPage(): void {
    this.productosPage = Math.max(1, this.productosPage - 1);
  }

  goProductosNextPage(): void {
    this.productosPage = Math.min(this.productosTotalPages, this.productosPage + 1);
  }

  goFacturasModalPrevPage(): void {
    this.facturasModalPage = Math.max(1, this.facturasModalPage - 1);
  }

  goFacturasModalNextPage(): void {
    this.facturasModalPage = Math.min(this.facturasModalTotalPages, this.facturasModalPage + 1);
  }

  estadoColor(estado: Factura['estado']): 'success' | 'warning' | 'danger' | 'medium' {
    if (estado === 'emitida') return 'success';
    if (estado === 'pagada') return 'warning';
    if (estado === 'anulada') return 'danger';
    return 'medium';
  }

  private recalculateCartItem(item: PosCartItem): PosCartItem {
    return recalcularConsumo(item);
  }

  private patchCartItem(item: PosCartItem): void {
    const updated = this.recalculateCartItem(item);
    this.cartItems = this.cartItems.map((current) => (current.key === item.key ? updated : current));
    this.marcarCuentaModificada();
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '.').replace(/[^0-9.-]/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private productoAplicaItbis(producto: ProductoServicio): boolean {
    return !producto.esNoFacturable
      && !producto.esExento
      && Number(producto.tasaItbis || 0) > 0;
  }

  private itemAplicaItbis(item: Partial<FacturaItem>): boolean {
    if (item.aplicaItbis === false) return false;
    if (Number(item.itbis || 0) > 0) return true;
    return Number(item.porcentajeItbis || 0) > 0;
  }

  private toTime(value: unknown): number | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private applyCatalogFilters(): void {
    const filters = this.filtrosCatalogo.getRawValue();
    const q = String(filters.busqueda || '').trim().toLowerCase();
    this.productosFiltrados = this.productos.filter((item) => {
      const tipo = item.tipoItem === 'servicio' ? 'servicio' : 'producto';
      const matchesText = !q || [item.nombre, item.codigoInterno, item.categoriaNombre].some((v) => String(v || '').toLowerCase().includes(q));
      const matchesTipo = filters.tipo === 'todos' || filters.tipo === tipo;
      const matchesCategoria = filters.categoria === 'todas' || item.categoriaNombre === filters.categoria;
      const matchesStock = this.catalogStockFilter === 'todos' || this.canAddProducto(item);
      return matchesText && matchesTipo && matchesCategoria && matchesStock;
    });
    this.productosPage = 1;
  }

  async abrirModalFacturas(estado: 'emitida' | 'borrador'): Promise<void> {
    this.facturasModalEstado = estado;
    if (!this.facturasFechaDesde || !this.facturasFechaHasta) {
      const today = this.toDateInputValue(new Date());
      this.facturasFechaDesde = today;
      this.facturasFechaHasta = today;
    }
    this.facturasModalOpen = true;
    await this.cargarFacturasHoyPorEstado(estado);
  }

  async cargarFacturasHoyPorEstado(estado: 'emitida' | 'borrador' = this.facturasModalEstado): Promise<void> {
    if (!this.facturasFechaDesde || !this.facturasFechaHasta) {
      await this.toastService.error('Selecciona las fechas desde y hasta.');
      return;
    }
    if (this.facturasFechaDesde > this.facturasFechaHasta) {
      await this.toastService.error('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    this.facturasModalLoading = true;
    this.facturasModalEstado = estado;
    this.facturasModalPage = 1;
    try {
      const desdeIso = new Date(`${this.facturasFechaDesde}T00:00:00.000`).toISOString();
      const hastaIso = new Date(`${this.facturasFechaHasta}T23:59:59.999`).toISOString();
      const facturas = await this.facturacionService.getFacturasPorRangoYEstado(estado, desdeIso, hastaIso);
      this.facturasDelDia = [...(facturas || [])].sort((a, b) => (b.creadoEn || b.fecha || '').localeCompare(a.creadoEn || a.fecha || ''));
    } catch (error) {
      console.error('[Facturacion] cargarFacturasHoyPorEstado error:', error);
      this.facturasDelDia = [];
      await this.toastService.error('No fue posible cargar las facturas del período.');
    } finally {
      this.facturasModalLoading = false;
    }
  }

  async restablecerFiltroFacturas(): Promise<void> {
    const today = this.toDateInputValue(new Date());
    this.facturasFechaDesde = today;
    this.facturasFechaHasta = today;
    await this.cargarFacturasHoyPorEstado();
  }

  cerrarModalFacturas(): void {
    this.facturasModalOpen = false;
    this.facturasDelDia = [];
    this.facturasModalPage = 1;
  }

  continuarBorrador(factura: Factura): void {
    if (this.cuentaActiva) { void this.toastService.error('Guarda y sal de la cuenta antes de continuar un borrador.'); return; }
    if (factura.estado !== 'borrador') return;
    const items = (factura.items || []).map((item, index) => this.recalculateCartItem({
      ...item,
      key: `${item.productoServicioId || item.codigo || 'item'}-${index}-${Date.now()}`,
      cantidad: Number(item.cantidad || 1),
      precioUnitario: Number(item.precioUnitario || 0),
      descuento: Number(item.descuento || 0),
      aplicaItbis: this.itemAplicaItbis(item),
      porcentajeItbis: Number(item.porcentajeItbis || 0),
      subtotal: Number(item.subtotal || 0),
      itbis: Number(item.itbis || 0),
      total: Number(item.total || 0),
      manejaInventario: !!item.manejaInventario,
      stockActual: Number(item.stockActual || 0),
    } as PosCartItem));

    this.cartItems = items;
    const tipoComprobante = ['B01', 'B02', 'B14', 'B15'].includes(String(factura.tipoComprobante))
      ? (factura.tipoComprobante as 'B01' | 'B02' | 'B14' | 'B15')
      : 'B02';

    this.facturaForm.patchValue({
      clienteId: factura.clienteId || '',
      citaId: factura.citaId || '',
      tipoComprobante,
      formaPago: factura.formaPago || 'efectivo',
      descuentoGlobal: Number(factura.descuentoTotal || 0),
      origen: factura.origen || 'manual',
    });
    if (factura.clienteId) this.selectCliente(factura.clienteId);
    if (factura.citaId) this.selectCita(factura.citaId);
    this.tabMobile = 'carrito';
    this.cerrarModalFacturas();
  }

  async limpiarFacturaActual(): Promise<void> {
    if (this.cuentaActiva) { await this.guardarYSalirCuenta(); return; }
    this.resetFacturaActual();
    await this.toastService.success('Factura actual limpiada.');
  }

  private buildFacturaPayload(userId: string, mode: 'emitida' | 'borrador', montoPagado = 0, pagosBreakdown?: any): Omit<Factura, 'numero'> {
    const cliente = this.clientes.find((c) => c.id === this.facturaForm.value.clienteId) || this.selectedCliente;
    const today = new Date().toISOString();
    const formaPago = this.facturaForm.value.formaPago || 'efectivo';
    const paid = formaPago === 'credito' ? 0 : Number(montoPagado || 0);
    const pagoRecibido = {
      efectivo: formaPago === 'efectivo' ? paid : 0,
      tarjeta: formaPago === 'tarjeta' ? paid : 0,
      transferencia: formaPago === 'transferencia' ? paid : 0,
      credito: formaPago === 'credito' ? this.total : 0,
      totalPagadoAhora: paid,
      totalRegistrado: paid,
      diferencia: Number((this.total - paid).toFixed(2)),
    };
    const pagos = pagosBreakdown || (mode === 'emitida' ? aplicarPagoAFactura(pagoRecibido, this.total) : pagoRecibido);
    const totalCredito = Number(pagos.credito || 0);
    const change = Number((paid - (this.total - totalCredito)).toFixed(2));
    const estadoPago: Factura['estadoPago'] = mode !== 'emitida'
      ? 'pendiente'
      : totalCredito > 0 && paid > 0
        ? 'parcial'
        : totalCredito > 0 && paid === 0
          ? 'credito'
          : 'pagada';
    return {
      cuentaAbiertaId: this.cuentaActiva?.id,
      cuentaAbiertaVersion: this.cuentaActiva?.version,
      numeroFactura: '',
      ncf: '',
      tipoComprobante: this.facturaForm.value.tipoComprobante || 'B02',
      clienteId: this.cuentaActiva ? this.cuentaActiva.clienteId || undefined : cliente?.id,
      clienteNombre: this.cuentaActiva?.clienteNombre || cliente?.nombreCompleto || 'Cliente general',
      clienteTelefono: cliente?.telefono,
      clienteCorreo: cliente?.correo,
      clienteRncCedula: (cliente as any)?.rnc || (cliente as any)?.rncCedula,
      artistaId: this.selectedCita?.artistaId || userId,
      artistaNombre: this.selectedCita?.artistaNombre || 'Sistema',
      citaId: this.facturaForm.value.citaId || undefined,
      items: this.cartItems,
      subtotal: this.subtotal,
      descuentoTotal: this.descuentoGlobal,
      impuesto: this.itbisTotal,
      itbisTotal: this.itbisTotal,
      total: this.total,
      estado: mode === 'emitida' ? 'emitida' : 'borrador',
      origen: this.facturaForm.value.origen || 'manual',
      formaPago,
      pagos: {
        montosAplicados: true,
        efectivo: Number(pagos.efectivo || 0),
        tarjeta: Number(pagos.tarjeta || 0),
        transferencia: Number(pagos.transferencia || 0),
        credito: Number(pagos.credito || 0),
        totalPagadoAhora: Number(pagos.totalPagadoAhora || 0),
        totalCredito,
      },
      totalPagado: Number(pagos.totalPagadoAhora ?? 0),
      montoPagado: paid,
      devuelta: mode === 'emitida' ? Math.max(0, change) : 0,
      cambio: mode === 'emitida' ? Math.max(0, change) : 0,
      fechaPago: mode === 'emitida' && Number(pagos.totalPagadoAhora || 0) > 0 ? today : undefined,
      estadoPago,
      estadoFiscal: 'pendiente',
      preparadoParaECF: true,
      inventarioAfectado: false,
      fecha: today,
      creadaPor: userId,
      creadoEn: today,
      actualizadoEn: today,
      turnoId: this.turnoActivo?.id,
      turnoNumero: this.turnoActivo?.numeroTurno,
      cajaId: this.turnoActivo?.cajaId,
      cajaNombre: this.turnoActivo?.cajaNombre,
      aperturaTurno: this.toIsoDate(this.turnoActivo?.fechaApertura),
      cierreTurno: this.toIsoDate(this.turnoActivo?.fechaCierre),
      usuarioTurnoId: this.turnoActivo?.usuarioId,
      usuarioTurnoNombre: this.turnoActivo?.usuarioNombre,
    };
  }

  async iniciarTurno(): Promise<void> {
    if (this.turnoActionLoading) return;
    if (this.aperturaTurnoForm.invalid) {
      await this.toastService.error('Completa caja y monto inicial válido.');
      return;
    }
    const user = await firstValueFrom(this.authService.user$);
    if (!user?.uid) {
      await this.toastService.error('No se pudo validar el usuario actual.');
      return;
    }
    if (!this.isOnline()) {
      await this.showOfflineAlert(() => this.iniciarTurno(), 'iniciar el turno y sincronizar la caja');
      return;
    }
    try {
      this.turnoActionLoading = true;
      await this.showLoading('Iniciando turno...', 'Estamos preparando la caja para comenzar a facturar.');
      const profile = await firstValueFrom(this.authService.userData$);
      const raw = this.aperturaTurnoForm.getRawValue();
      this.turnoActivo = await this.turnosCajaService.abrirTurno({
        cajaId: String(raw.cajaId || 'principal'),
        cajaNombre: String(raw.cajaNombre || 'Caja principal'),
        usuarioId: user.uid,
        usuarioNombre: String(profile?.displayName || profile?.nombre || user.email || 'Usuario POS'),
        montoInicial: Number(raw.montoInicial || 0),
        observacionApertura: String(raw.observacionApertura || ''),
      });
      await this.cargarTotalesTurno();
      await this.showSuccessToast('Turno iniciado. Ya puedes comenzar a facturar.');
    } catch (error) {
      console.error('[Facturacion] iniciarTurno error:', error);
      await this.showErrorAlert(
        'No pudimos iniciar el turno',
        'Intenta nuevamente. Si el problema continúa, verifica tu conexión o contacta al administrador.',
      );
    } finally {
      await this.dismissLoading();
      this.turnoActionLoading = false;
      this.catalogFocusPending = true;
      this.focusCatalogSearchIfReady();
    }
  }

  async abrirModalCierreTurno(): Promise<void> {
    if (!this.turnoActivo || this.turnoActivo.estado !== 'abierto' || this.turnoActionLoading) return;
    this.turnoActionLoading = true;
    try {
      // El resumen puede haber quedado anterior a las últimas ventas del POS.
      // Mostrar el cierre únicamente después de consultar sus facturas actuales.
      await this.cargarTotalesTurno();
      this.cierreTurnoForm.reset({
        usarDesglose: true,
        incluirFondoInicial: false,
        cantidades: this.denominacionesCierre.map(() => 0),
        efectivoContado: 0,
        observacionCierre: '',
      });
      this.showCierreTurnoModal = true;
    } catch { await this.toastService.error('No se pudo actualizar el resumen del cierre. Verifica la conexión y vuelve a intentarlo.'); }
    finally { this.turnoActionLoading = false; }
  }

  cerrarModalCierreTurno(): void {
    this.showCierreTurnoModal = false;
  }

  async cerrarTurno(): Promise<void> {
    if (this.turnoActionLoading) return;
    if (!this.turnoActivo || this.turnoActivo.estado !== 'abierto') {
      await this.toastService.error('No hay turno abierto para cerrar.');
      return;
    }
    if (this.cierreTurnoForm.invalid) {
      await this.toastService.error('El efectivo contado debe ser válido.');
      return;
    }

    try {
      this.turnoActionLoading = true;
      const efectivoContado = this.totalContadoCierre;
      const observacionCierre = String(this.cierreTurnoForm.value.observacionCierre || '');
      const turnoCerrado = await this.turnosCajaService.cerrarTurno(
        this.turnoActivo,
        efectivoContado,
        observacionCierre,
        this.cierreTurnoForm.controls.usarDesglose.value ? this.desgloseCierre : undefined,
        this.cierreTurnoForm.controls.incluirFondoInicial.value,
      );
      this.showCierreTurnoModal = false;
      await this.toastService.success('Turno cerrado correctamente.');
      this.turnoActivo = null;
      this.turnoTotales = {
        totalVentas: 0,
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalTransferencia: 0,
        totalCredito: 0,
        cantidadFacturas: 0,
      };
      await this.presentPostTurnoCloseActions(turnoCerrado, turnoCerrado, efectivoContado, observacionCierre);
    } catch (error) {
      console.error('[Facturacion] cerrarTurno error:', error);
      await this.toastService.error('No fue posible cerrar el turno.');
    } finally {
      this.turnoActionLoading = false;
    }
  }

  async refrescarResumenTurno(): Promise<void> {
    await this.cargarTotalesTurno();
  }

  private async cargarTurnoActivo(): Promise<void> {
    const user = await firstValueFrom(this.authService.user$);
    if (!user?.uid) return;
    this.turnoLoading = true;
    try {
      const cajaId = String(this.aperturaTurnoForm.value.cajaId || 'principal');
      this.turnoActivo = await this.turnosCajaService.getTurnoAbierto(user.uid, cajaId);
      if (this.turnoActivo) {
        await this.cargarTotalesTurno();
      }
    } catch (error) {
      console.error('[Facturacion] cargarTurnoActivo error:', error);
      this.turnoActivo = null;
    } finally {
      this.turnoLoading = false;
      this.focusCatalogSearchIfReady();
    }
  }

  private async cargarTotalesTurno(): Promise<void> {
    if (!this.turnoActivo?.id) return;
    this.turnoTotales = await this.turnosCajaService.calcularTotalesTurno(this.turnoActivo.id);
  }

  private async ensureTurnoActivo(): Promise<boolean> {
    if (this.turnoActivo && this.turnoActivo.estado === 'abierto') return true;
    await this.cargarTurnoActivo();
    if (this.turnoActivo && this.turnoActivo.estado === 'abierto') return true;
    await this.showConfirmTurnoRequired();
    return false;
  }

  private toIsoDate(value: any): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return undefined;
  }

  private tryApplyAgendaContext(): void {
    if (this.cuentaActiva) return;
    const citaId = this.route.snapshot.queryParamMap.get('citaId');
    if (!citaId || this.selectedCita?.id === citaId) return;
    const modo = this.route.snapshot.queryParamMap.get('modo');
    const selectedMode: 'abono' | 'total' | 'pendiente' = modo === 'abono' || modo === 'pendiente' ? modo : 'total';
    const cita = this.citas.find((item) => item.id === citaId);
    if (!cita) return;
    this.selectCita(citaId, selectedMode);
    this.facturaForm.patchValue({ citaId, origen: 'agenda' });
  }

  private async fetchFacturaByIdWithRetry(facturaId: string, maxAttempts = 6, delayMs = 250): Promise<Factura | undefined> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const factura = await firstValueFrom(this.facturacionService.getFacturaById(facturaId));
      if (factura) return factura;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  }

  private async presentPostEmitActions(factura: Factura): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Factura emitida',
      message: 'La factura fue emitida correctamente. Puedes imprimir el ticket o abrir el PDF.',
      buttons: [
        { text: `Imprimir (${this.printerConfigurationLabel})`, handler: () => void this.imprimirFacturaConfigurada(factura) },
        { text: 'Abrir PDF', handler: () => this.pdfFacturaService.abrirFacturaPdf(factura) },
        { text: 'Descargar PDF', handler: () => this.pdfFacturaService.descargarFacturaPdf(factura) },
        { text: 'Cerrar', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  private async presentPostSaveActions(factura: Factura): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Borrador guardado',
      message: 'La factura fue guardada correctamente. Puedes imprimir, abrir o guardar el comprobante.',
      buttons: [
        { text: 'Abrir PDF', handler: () => this.pdfFacturaService.abrirFacturaPdf(factura) },
        { text: 'Imprimir', handler: () => this.pdfFacturaService.imprimirFacturaPdf(factura) },
        { text: 'Descargar PDF', handler: () => this.pdfFacturaService.descargarFacturaPdf(factura) },
        { text: 'Cerrar', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  private async presentPostTurnoCloseActions(
    turno: TurnoCaja,
    totales: TurnoTotales,
    efectivoContado: number,
    observacionCierre: string,
  ): Promise<void> {
    const configuration = await this.printerConfigurationService.load();
    const alert = await this.alertCtrl.create({
      header: 'Cierre de turno completado',
      message: 'El turno se cerró correctamente. Puedes imprimir, abrir o descargar el ticket de cierre.',
      buttons: [
        { text: `Imprimir (${this.printerConfigurationLabel})`, handler: () => void this.imprimirCuadreConfigurado(turno) },
        { text: 'Abrir PDF', handler: () => this.pdfFacturaService.abrirCierreTurno(turno, totales, efectivoContado, observacionCierre, configuration.format) },
        { text: 'Descargar PDF', handler: () => this.pdfFacturaService.descargarCierreTurno(turno, totales, efectivoContado, observacionCierre, configuration.format) },
        { text: 'Cerrar', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  private async imprimirCuadreConfigurado(turno: TurnoCaja): Promise<void> {
    try {
      await this.invoicePrintingService.printShiftClose(turno);
    } catch (error) {
      await this.toastService.error(this.invoicePrintingService.getFriendlyError(error));
    }
  }

  private isOnline(): boolean {
    return navigator.onLine;
  }

  private async showLoading(message: string, subMessage?: string): Promise<void> {
    await this.dismissLoading();
    this.activeLoading = await this.loadingCtrl.create({
      message: subMessage ? `${message} ${subMessage} ` : message,
      backdropDismiss: false,
      spinner: 'circular',
      mode: 'md',
    });
    await this.activeLoading.present();
  }

  private async dismissLoading(): Promise<void> {
    if (!this.activeLoading) return;
    try {
      await this.activeLoading.dismiss();
    } catch {
      // ignore already dismissed
    } finally {
      this.activeLoading = undefined;
    }
  }

  private async showSuccessToast(message: string): Promise<void> {
    await this.toastService.success(message);
  }

  private async showErrorAlert(title: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: title,
      message,
      buttons: ['Entendido'],
    });
    await alert.present();
  }

  private async showConfirmTurnoRequired(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Turno no iniciado',
      message: 'Para emitir facturas necesitas abrir un turno de caja. Esto permite registrar tus ventas, pagos y cierre del día correctamente.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Iniciar turno',
          handler: () => {
            const turnoSection = document.querySelector('.turno-card');
            if (turnoSection) turnoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
      ],
    });
    await alert.present();
  }

  private async showOfflineAlert(retry: () => Promise<void>, actionMessage: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Sin conexión a internet',
      message: `Necesitas conexión para ${actionMessage}.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Reintentar', handler: () => retry() },
      ],
    });
    await alert.present();
  }

  private resetFacturaActual(): void {
    this.cuentaActiva = null;
    this.cuentaPendiente = undefined;
    this.cuentaEstado = 'guardada';
    this.cuentaError = '';
    this.cartItems = [];
    this.selectedCliente = undefined;
    this.selectedCita = undefined;
    this.selectedCitaModo = 'total';
    this.facturaForm.reset({
      clienteId: '',
      citaId: '',
      descuentoGlobal: 0,
      origen: 'manual',
      formaPago: 'efectivo',
      tipoComprobante: 'B02',
    });
    this.cobroForm.reset({
      montoPagado: 0,
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      credito: 0,
    });
    this.closeCobroModal();
  }

  private removeCitaCartItems(): void {
    this.cartItems = this.cartItems.filter((item) => !String(item.key || '').startsWith('cita-'));
  }

  private async syncCitaAfterFactura(factura: Factura, facturaId: string, userId: string): Promise<void> {
    const citaId = factura.citaId || this.selectedCita?.id;
    if (!citaId) return;

    const citaBase = this.citas.find((item) => item.id === citaId) || this.selectedCita;
    if (!citaBase) return;

    const totalCita = this.getCitaTotalEstimado(citaBase);
    const pagadoPrevio = this.getCitaMontoPagado(citaBase);
    const pagadoAhora = Number(factura.pagos?.totalPagadoAhora || factura.montoPagado || 0);
    const nuevoMontoPagado = Number(Math.min(totalCita, pagadoPrevio + pagadoAhora).toFixed(2));
    const nuevoBalance = Number(Math.max(0, totalCita - nuevoMontoPagado).toFixed(2));
    const estadoPago: Cita['estadoPago'] = nuevoMontoPagado <= 0 ? 'sin_pago' : (nuevoBalance > 0 ? 'parcial' : 'pagada');
    const facturaIds = Array.from(new Set([...(citaBase.facturaIds || []), facturaId]));

    let cuentaPorCobrarId = citaBase.cuentaPorCobrarId;
    if (nuevoBalance > 0) {
      try {
        const mergedCita: Cita = {
          ...citaBase,
          montoPagado: nuevoMontoPagado,
          balancePendiente: nuevoBalance,
          estadoPago,
          facturaIds,
        };
        cuentaPorCobrarId = await this.cuentasPorCobrarService.syncDesdeCita({
          cita: mergedCita,
          factura,
          facturaId,
          userId,
          montoPagado: nuevoMontoPagado,
          balancePendiente: nuevoBalance,
        }) || cuentaPorCobrarId;
      } catch (error) {
        console.error('[Facturacion] syncCuentaPorCobrar cita error:', error);
        await this.toastService.error('Factura emitida, pero no se pudo actualizar la cuenta por cobrar de la cita.');
      }
    }

    await this.agendaService.updateCita(citaId, {
      montoPagado: nuevoMontoPagado,
      balancePendiente: nuevoBalance,
      estadoPago,
      facturaIds,
      cuentaPorCobrarId: nuevoBalance > 0 ? cuentaPorCobrarId : undefined,
      actualizadoEn: new Date().toISOString(),
    } as any);

    const updatedCita: Cita = {
      ...citaBase,
      montoPagado: nuevoMontoPagado,
      balancePendiente: nuevoBalance,
      estadoPago,
      facturaIds,
      cuentaPorCobrarId: nuevoBalance > 0 ? cuentaPorCobrarId : undefined,
    };
    this.citas = this.citas.map((item) => (item.id === citaId ? updatedCita : item));
    if (this.selectedCita?.id === citaId) {
      this.selectedCita = updatedCita;
    }
  }

}
