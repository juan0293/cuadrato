import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription, combineLatest } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Cita } from '../../agenda/models/cita.model';
import { Cliente } from '../../agenda/models/cliente.model';
import { AgendaService } from '../../agenda/services/agenda.service';
import { ClientesService } from '../../agenda/services/clientes.service';
import { ProductoServicio } from '../../inventario/models/producto-servicio.model';
import { ProductosServiciosService } from '../../inventario/services/productos-servicios.service';
import { UsuarioModel } from '../../usuarios/models/usuario.model';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { FacturaItem } from '../models/factura-item.model';
import { Factura } from '../models/factura.model';
import { FacturacionService } from '../services/facturacion.service';
import { PdfFacturaService } from '../services/pdf-factura.service';
import { calcularImpuestoFactura, calcularSubtotalFactura, calcularTotalFactura, calcularTotalItem } from '../utils/invoice-calculation.utils';

@Component({
  standalone: false,
  selector: 'app-factura-form',
  templateUrl: './factura-form.page.html',
  styleUrls: ['./factura-form.page.scss'],
})
export class FacturaFormPage implements OnInit, OnDestroy {
  readonly artistas$ = this.usuariosService.list();
  readonly citas$ = this.agendaService.list();

  readonly form = this.fb.nonNullable.group({
    clienteNombre: ['', Validators.required],
    clienteTelefono: [''],
    artistaId: ['', Validators.required],
    citaId: [''],
    impuestoPorcentaje: [0],
    estado: ['emitida' as Factura['estado'], Validators.required],
  });

  readonly itemForm = this.fb.nonNullable.group({
    descripcion: ['', Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    precioUnitario: [0, [Validators.required, Validators.min(1)]],
  });

  readonly nuevoClienteForm = this.fb.nonNullable.group({
    nombreCompleto: ['', [Validators.required]],
    telefono: [''],
    correo: ['', [Validators.email]],
    rncCedula: [''],
  });

  items: FacturaItem[] = [];
  productos: ProductoServicio[] = [];
  clientes: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];
  busquedaClientes = '';

  clienteModalOpen = false;
  nuevoClienteModalOpen = false;

  private sub = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly usuariosService: UsuariosService,
    private readonly agendaService: AgendaService,
    private readonly facturacionService: FacturacionService,
    private readonly pdfFacturaService: PdfFacturaService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly clientesService: ClientesService,
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      combineLatest([
        this.clientesService.getClientes(),
        this.productosServiciosService.getProductosServicios(),
      ]).subscribe({
        next: ([clientes, productos]) => {
          this.clientes = (clientes || []).filter((item) => item.activo !== false);
          this.clientesFiltrados = [...this.clientes];
          this.productos = (productos || []).filter((item) => item.activo !== false);
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onlyArtists(users: UsuarioModel[] | null): UsuarioModel[] {
    return (users ?? []).filter((item) => {
      const role = item.role ?? item.rol;
      const isArtist = role === 'artist' || role === 'artista';
      const isActive = item.status ? item.status === 'active' : item.activo !== false;
      return isArtist && isActive;
    });
  }

  citasByArtist(citas: Cita[] | null, artistaId: string): Cita[] {
    if (!artistaId) return [];
    return (citas ?? []).filter((item) => item.artistaId === artistaId);
  }

  addItem(): void {
    if (this.itemForm.invalid) return;

    const raw = this.itemForm.getRawValue();
    const item: FacturaItem = {
      descripcion: raw.descripcion.trim(),
      cantidad: Number(raw.cantidad),
      precioUnitario: Number(raw.precioUnitario),
      total: calcularTotalItem(Number(raw.cantidad), Number(raw.precioUnitario)),
    };

    this.items = [...this.items, item];
    this.itemForm.reset({ descripcion: '', cantidad: 1, precioUnitario: 0 });
  }

  addProductoToItems(producto: ProductoServicio): void {
    const status = this.getStockStatus(producto);
    if (status === 'sin-stock') {
      void this.toastService.error('Producto sin stock disponible.');
      return;
    }

    const item: FacturaItem = {
      productoServicioId: producto.id,
      codigo: producto.codigoInterno,
      descripcion: producto.nombre,
      tipo: producto.tipoItem === 'servicio' ? 'servicio' : 'producto',
      cantidad: 1,
      precioUnitario: this.toNumber(producto.precioVenta),
      costoUnitario: this.toNumber(producto.precioCompra ?? producto.ultimoCosto ?? producto.costoPromedio),
      descuento: 0,
      aplicaItbis: !producto.esNoFacturable,
      porcentajeItbis: this.toNumber(producto.tasaItbis),
      subtotal: this.toNumber(producto.precioVenta),
      itbis: 0,
      total: this.toNumber(producto.precioVenta),
      categoria: producto.categoriaNombre,
      manejaInventario: !!producto.manejaInventario,
      stockActual: this.toNumber(producto.stockActual),
    };

    this.items = [...this.items, item];
  }

  removeItem(index: number): void {
    this.items = this.items.filter((_, itemIndex) => itemIndex !== index);
  }

  get subtotal(): number {
    return calcularSubtotalFactura(this.items);
  }

  get impuesto(): number {
    return calcularImpuestoFactura(this.subtotal, Number(this.form.value.impuestoPorcentaje || 0));
  }

  get total(): number {
    return calcularTotalFactura(this.subtotal, this.impuesto);
  }

  openClienteModal(): void {
    this.clienteModalOpen = true;
    this.busquedaClientes = '';
    this.clientesFiltrados = [...this.clientes];
  }

  closeClienteModal(): void {
    this.clienteModalOpen = false;
  }

  onBuscarClientes(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.filtrarClientes(String(target?.value || ''));
  }

  filtrarClientes(term: string): void {
    const q = this.normalizeText(term);
    this.busquedaClientes = term;

    if (!q) {
      this.clientesFiltrados = [...this.clientes];
      return;
    }

    this.clientesFiltrados = this.clientes.filter((cliente) => {
      const nombre = this.normalizeText((cliente as any).nombreCompleto || (cliente as any).nombre || '');
      const cedula = this.normalizeText((cliente as any).rncCedula || (cliente as any).cedula || '');
      const telefono = this.normalizeText((cliente as any).telefono || (cliente as any).numero || '');
      const correo = this.normalizeText((cliente as any).correo || '');

      return nombre.includes(q)
        || cedula.includes(q)
        || telefono.includes(q)
        || correo.includes(q);
    });
  }

  selectCliente(cliente: Cliente): void {
    this.form.patchValue({
      clienteNombre: String(cliente.nombreCompleto || '').trim(),
      clienteTelefono: String(cliente.telefono || '').trim(),
    });
    this.closeClienteModal();
  }

  setConsumidorFinal(): void {
    this.form.patchValue({ clienteNombre: 'Consumidor final', clienteTelefono: '' });
    this.closeClienteModal();
  }

  openNuevoClienteModal(): void {
    this.nuevoClienteModalOpen = true;
    this.nuevoClienteForm.reset({
      nombreCompleto: '',
      telefono: '',
      correo: '',
      rncCedula: '',
    });
  }

  closeNuevoClienteModal(): void {
    this.nuevoClienteModalOpen = false;
  }

  async saveNuevoCliente(): Promise<void> {
    if (this.nuevoClienteForm.invalid) {
      await this.toastService.error('Completa el nombre del cliente y un correo válido si aplica.');
      return;
    }

    const raw = this.nuevoClienteForm.getRawValue();
    const nombreCompleto = String(raw.nombreCompleto || '').trim();
    const telefono = String(raw.telefono || '').trim();
    const correo = String(raw.correo || '').trim();
    const rncCedula = String(raw.rncCedula || '').trim();

    if (rncCedula && await this.clientesService.existsClienteRncCedula(rncCedula)) {
      await this.toastService.error('Ya existe un cliente con esa cédula/RNC.');
      return;
    }

    if (telefono && await this.clientesService.existsClienteTelefono(telefono)) {
      await this.toastService.error('Ya existe un cliente con ese teléfono.');
      return;
    }

    const id = await this.clientesService.createCliente({
      nombreCompleto,
      telefono: telefono || undefined,
      correo: correo || undefined,
      rncCedula: rncCedula || undefined,
      activo: true,
      creadoEn: new Date().toISOString(),
    } as Cliente);

    const clienteCreado: Cliente = {
      id,
      nombreCompleto,
      telefono: telefono || undefined,
      correo: correo || undefined,
      rncCedula: rncCedula || undefined,
      activo: true,
      creadoEn: new Date().toISOString(),
    };

    this.clientes = [clienteCreado, ...this.clientes].sort((a, b) => String(a.nombreCompleto || '').localeCompare(String(b.nombreCompleto || '')));
    this.clientesFiltrados = [...this.clientes];

    this.selectCliente(clienteCreado);
    this.closeNuevoClienteModal();
    await this.toastService.success('Cliente guardado correctamente.');
  }

  getStockStatus(item: ProductoServicio): 'sin-stock' | 'disponible' | 'servicio' {
    if (item?.tipoItem === 'servicio') return 'servicio';

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

  /**
   * Crea factura, genera PDF y registra ingreso financiero automático
   * desde un único flujo para evitar inconsistencias contables.
   */
  async save(): Promise<void> {
    if (this.form.invalid || this.items.length === 0) {
      await this.toastService.error('Completa datos de factura e incluye al menos un item.');
      return;
    }

    const raw = this.form.getRawValue();
    const artists = await firstValueFrom(this.usuariosService.list());
    const artist = artists.find((item) => item.id === raw.artistaId);

    if (!artist) {
      await this.toastService.error('Selecciona un artista válido.');
      return;
    }

    const user = await firstValueFrom(this.authService.user$);

    const facturaPayload: Omit<Factura, 'numero'> = {
      clienteNombre: raw.clienteNombre.trim(),
      clienteTelefono: raw.clienteTelefono?.trim() || undefined,
      artistaId: raw.artistaId,
      artistaNombre: artist.displayName ?? artist.nombre ?? 'Artista',
      citaId: raw.citaId || undefined,
      items: this.items,
      subtotal: this.subtotal,
      impuesto: this.impuesto,
      total: this.total,
      estado: raw.estado,
      fecha: new Date().toISOString(),
      creadaPor: user?.uid ?? 'sistema',
    };

    const facturaId = await this.facturacionService.crearFactura(facturaPayload);

    const facturaCompleta: Factura = {
      ...facturaPayload,
      id: facturaId,
      numero: 'TEMP',
    };

    this.pdfFacturaService.generarFacturaPdf({ ...facturaCompleta, numero: `FACT-${facturaId.slice(0, 6).toUpperCase()}` });

    await this.toastService.success('Factura creada y PDF generado.');
    await this.router.navigateByUrl('/admin/facturacion');
  }
}
