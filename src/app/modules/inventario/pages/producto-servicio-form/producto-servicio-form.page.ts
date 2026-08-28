import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { firstValueFrom, Observable, Subscription } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { applyFiscalDefaults } from '../../helpers/fiscal-inventory.helper';
import { mapIndicadorFacturacion } from '../../helpers/producto-servicio.helper';
import { resolvePrecioVenta } from '../../helpers/pricing.helper';
import { CategoriaProducto } from '../../models/categoria-producto.model';
import { ProductoServicio } from '../../models/producto-servicio.model';
import { Proveedor } from '../../models/proveedor.model';
import { UnidadMedida } from '../../models/unidad-medida.model';
import { Utilidad } from '../../models/utilidad.model';
import { CategoriasProductosService } from '../../services/categorias-productos.service';
import { CatalogoFiscalService } from '../../services/catalogo-fiscal.service';
import { ProductosServiciosService } from '../../services/productos-servicios.service';
import { ProveedoresService } from '../../services/proveedores.service';
import { UnidadesMedidaService } from '../../services/unidades-medida.service';
import { UtilidadesService } from '../../services/utilidades.service';
import { validateProductoServicio } from '../../utils/inventory-validation.utils';
import { CategoriasProductosPage } from '../categorias-productos/categorias-productos.page';
import { UnidadesMedidaPage } from '../unidades-medida/unidades-medida.page';
import { UtilidadesPage } from '../utilidades/utilidades.page';
import { ProveedoresPage } from '../proveedores/proveedores.page';

@Component({
  selector: 'app-producto-servicio-form',
  templateUrl: './producto-servicio-form.page.html',
  styleUrls: ['./producto-servicio-form.page.scss'],
  standalone: false,
})
export class ProductoServicioFormPage implements OnInit, OnDestroy {
  itemId: string | null = null;
  isEditMode = false;
  isLoading = false;
  isSaving = false;
  codigoDisponible: boolean | null = null;
  productoSeleccionado: ProductoServicio | null = null;
  private rulesBound = false;
  precioCompraDisplay = '';
  precioCompraInvalid = false;
  precioVentaDisplay = '';
  precioVentaInvalid = false;
  proveedorModalOpen = false;
  proveedorQuery = '';
  proveedoresCache: Proveedor[] = [];
  filteredProveedores: Proveedor[] = [];
  private readonly sub = new Subscription();

  readonly indicadores = this.catalogoFiscalService.getIndicadoresFacturacion();
  readonly categoriasActivas$: Observable<CategoriaProducto[]> = this.categoriasService.getCategoriasActivas();
  readonly unidadesActivas$: Observable<UnidadMedida[]> = this.unidadesService.getUnidadesActivas();
  readonly utilidadesActivas$: Observable<Utilidad[]> = this.utilidadesService.getUtilidadesActivas();
  readonly proveedoresActivos$: Observable<Proveedor[]> = this.proveedoresService.getProveedoresActivos();

  readonly form = this.fb.nonNullable.group({
    codigoInterno: ['', [Validators.required]],
    nombre: ['', [Validators.required]],
    descripcion: [''],
    tipoItem: ['bien' as 'bien' | 'servicio', [Validators.required]],
    manejaInventario: [true],
    categoriaId: ['', [Validators.required]],
    categoriaNombre: ['', [Validators.required]],
    unidadMedidaId: [''],
    unidadMedidaCodigo: [''],
    unidadMedidaNombre: [''],
    utilidadId: [''],
    utilidadNombre: [''],
    utilidadPorcentaje: [0],
    proveedorId: [''],
    proveedorNombre: [''],
    proveedorRnc: [''],
    proveedorTelefono: [''],
    proveedorEmail: [''],
    moneda: ['DOP', [Validators.required]],
    stockActual: [0],
    stockMinimo: [0],
    stockMaximo: [0],
    precioCompra: [0, [Validators.min(0)]],
    precioVenta: [0, [Validators.required, Validators.min(0)]],
    precioVentaEditadoManual: [false],
    indicadorFacturacion: [1 as 0 | 1 | 2 | 3 | 4, [Validators.required]],
    tasaItbis: [18 as 0 | 16 | 18],
    esExento: [false],
    esNoFacturable: [false],
    activo: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly categoriasService: CategoriasProductosService,
    private readonly unidadesService: UnidadesMedidaService,
    private readonly utilidadesService: UtilidadesService,
    private readonly proveedoresService: ProveedoresService,
    private readonly catalogoFiscalService: CatalogoFiscalService,
    private readonly toastService: ToastService,
    private readonly modalCtrl: ModalController,
  ) {}

  ngOnInit(): void {
    if (!this.rulesBound) {
      this.bindReactiveRules();
      this.rulesBound = true;
    }

    this.sub.add(
      this.proveedoresActivos$.subscribe((items) => {
        this.proveedoresCache = items || [];
        this.applyProveedorFilter();
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  async ionViewWillEnter(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode = true;
      this.itemId = id;
      await this.loadItem(id);
      return;
    }
    this.isEditMode = false;
    this.itemId = null;
    await this.resetFormulario();
  }

  private bindReactiveRules(): void {
    this.form.controls.tipoItem.valueChanges.subscribe((tipoItem) => {
      if (tipoItem === 'servicio') {
        this.form.patchValue({ manejaInventario: false, stockActual: 0, stockMinimo: 0, stockMaximo: 0 }, { emitEvent: false });
      }
    });

    this.form.controls.indicadorFacturacion.valueChanges.subscribe((indicador) => {
      const mapped = mapIndicadorFacturacion(indicador);
      this.form.patchValue(mapped, { emitEvent: false });
    });

    this.form.controls.precioCompra.valueChanges.subscribe(() => this.autoRecalculatePrecioVenta());
    this.form.controls.utilidadPorcentaje.valueChanges.subscribe(() => this.autoRecalculatePrecioVenta());
  }

  private async loadItem(id: string): Promise<void> {
    this.isLoading = true;
    try {
      const item = await firstValueFrom(this.productosServiciosService.getById(id));
      this.productoSeleccionado = item;
      this.form.patchValue({
        codigoInterno: item.codigoInterno,
        nombre: item.nombre,
        descripcion: item.descripcion || '',
        tipoItem: item.tipoItem,
        manejaInventario: item.manejaInventario,
        categoriaId: item.categoriaId,
        categoriaNombre: item.categoriaNombre,
        unidadMedidaId: item.unidadMedidaId || '',
        unidadMedidaCodigo: item.unidadMedidaCodigo || '',
        unidadMedidaNombre: item.unidadMedidaNombre || '',
        utilidadId: item.utilidadId || '',
        utilidadNombre: item.utilidadNombre || '',
        utilidadPorcentaje: item.utilidadPorcentaje || 0,
        proveedorId: item.proveedorId || '',
        proveedorNombre: item.proveedorNombre || '',
        proveedorRnc: item.proveedorRnc || '',
        proveedorTelefono: item.proveedorTelefono || '',
        proveedorEmail: item.proveedorEmail || '',
        moneda: item.moneda,
        stockActual: item.stockActual,
        stockMinimo: item.stockMinimo || 0,
        stockMaximo: item.stockMaximo || 0,
        precioCompra: item.precioCompra || 0,
        precioVenta: item.precioVenta,
        precioVentaEditadoManual: item.precioVentaEditadoManual || false,
        indicadorFacturacion: item.indicadorFacturacion,
        tasaItbis: item.tasaItbis,
        esExento: item.esExento,
        esNoFacturable: item.esNoFacturable,
        activo: item.activo,
      });
      this.codigoDisponible = null;
      this.precioCompraDisplay = this.formatDecimal(item.precioCompra || 0);
      this.precioCompraInvalid = false;
      this.precioVentaDisplay = this.formatDecimal(item.precioVenta || 0);
      this.precioVentaInvalid = false;
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } finally {
      this.isLoading = false;
    }
  }

  private async resetFormulario(): Promise<void> {
    this.form.reset({
      codigoInterno: '',
      nombre: '',
      descripcion: '',
      tipoItem: 'bien',
      manejaInventario: true,
      categoriaId: '',
      categoriaNombre: '',
      unidadMedidaId: '',
      unidadMedidaCodigo: '',
      unidadMedidaNombre: '',
      utilidadId: '',
      utilidadNombre: '',
      utilidadPorcentaje: 0,
      proveedorId: '',
      proveedorNombre: '',
      proveedorRnc: '',
      proveedorTelefono: '',
      proveedorEmail: '',
      moneda: 'DOP',
      stockActual: 0,
      stockMinimo: 0,
      stockMaximo: 0,
      precioCompra: 0,
      precioVenta: 0,
      precioVentaEditadoManual: false,
      indicadorFacturacion: 1 as 0 | 1 | 2 | 3 | 4,
      tasaItbis: 18 as 0 | 16 | 18,
      esExento: false,
      esNoFacturable: false,
      activo: true,
    });
    this.productoSeleccionado = null;
    this.codigoDisponible = null;
    this.precioCompraDisplay = this.formatDecimal(0);
    this.precioCompraInvalid = false;
    this.precioVentaDisplay = this.formatDecimal(0);
    this.precioVentaInvalid = false;
    this.isSaving = false;
    this.isLoading = false;
    this.form.markAsPristine();
    this.form.markAsUntouched();
    await this.generateCodigo();
  }

  async generateCodigo(): Promise<void> {
    const next = await this.productosServiciosService.getNextCodigoInterno();
    this.form.patchValue({ codigoInterno: next });
    this.codigoDisponible = null;
  }

  async validateCodigo(): Promise<void> {
    const codigo = this.form.controls.codigoInterno.value.trim();
    if (!codigo) {
      await this.toastService.error('Código interno requerido.');
      return;
    }

    const exists = await this.productosServiciosService.existsCodigoInterno(codigo, this.itemId || undefined);
    this.codigoDisponible = !exists;

    if (exists) {
      await this.toastService.error('Este código ya está en uso.');
      return;
    }

    await this.toastService.success('Código disponible.');
  }

  onCategoriaSelected(categoria: CategoriaProducto): void {
    this.form.patchValue({
      categoriaId: categoria.id || '',
      categoriaNombre: categoria.nombre,
      tipoItem: categoria.tipoDefault || this.form.controls.tipoItem.value,
      manejaInventario: categoria.manejaInventarioDefault ?? this.form.controls.manejaInventario.value,
    });
  }

  onUnidadSelected(unidad: UnidadMedida): void {
    this.form.patchValue({
      unidadMedidaId: unidad.id || '',
      unidadMedidaCodigo: unidad.codigo,
      unidadMedidaNombre: unidad.nombre,
    });
  }

  onUtilidadSelected(utilidad: Utilidad): void {
    this.form.patchValue({
      utilidadId: utilidad.id || '',
      utilidadNombre: utilidad.nombre,
      utilidadPorcentaje: utilidad.porcentaje,
      precioVentaEditadoManual: false,
    });
    this.autoRecalculatePrecioVenta();
  }

  onProveedorSelected(proveedor: Proveedor): void {
    this.form.patchValue({
      proveedorId: proveedor.id || '',
      proveedorNombre: proveedor.nombre,
      proveedorRnc: proveedor.rnc || '',
      proveedorTelefono: proveedor.telefono || '',
      proveedorEmail: proveedor.email || '',
    });
  }

  openProveedorModal(): void {
    this.proveedorModalOpen = true;
    this.proveedorQuery = '';
    this.applyProveedorFilter();
  }

  closeProveedorModal(): void {
    this.proveedorModalOpen = false;
  }

  onProveedorSearch(event: Event): void {
    const value = String((event as CustomEvent).detail?.value || '');
    this.proveedorQuery = value;
    this.applyProveedorFilter();
  }

  selectProveedorFromModal(proveedor: Proveedor): void {
    this.onProveedorSelected(proveedor);
    this.closeProveedorModal();
  }

  get selectedProveedorLabel(): string {
    return this.form.controls.proveedorNombre.value || 'Selecciona un proveedor';
  }

  onPrecioCompraFocus(): void {
    this.precioCompraInvalid = false;
    this.precioCompraDisplay = this.formatEditableNumber(this.form.controls.precioCompra.value);
  }

  onPrecioCompraInput(event: Event): void {
    const value = String((event as CustomEvent).detail?.value ?? '');
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const isIncomplete = normalized === '' || normalized === '-' || normalized === '.';
    this.precioCompraDisplay = normalized;
    if (isIncomplete) {
      this.precioCompraInvalid = normalized !== '';
      this.form.patchValue({ precioCompra: 0 }, { emitEvent: true });
      return;
    }

    const parsed = Number(normalized);
    this.precioCompraInvalid = Number.isNaN(parsed);
    this.form.patchValue({ precioCompra: Number.isFinite(parsed) ? parsed : 0 }, { emitEvent: true });
  }

  onPrecioCompraBlur(): void {
    const numericValue = this.toNumber(this.precioCompraDisplay);
    this.form.patchValue({ precioCompra: numericValue }, { emitEvent: true });
    this.precioCompraDisplay = this.formatDecimal(numericValue);
    this.precioCompraInvalid = false;
  }

  onPrecioVentaFocus(): void {
    this.precioVentaInvalid = false;
    this.precioVentaDisplay = this.formatEditableNumber(this.form.controls.precioVenta.value);
  }

  onPrecioVentaInput(event: Event): void {
    const value = String((event as CustomEvent).detail?.value ?? '');
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const isIncomplete = normalized === '' || normalized === '-' || normalized === '.';
    this.precioVentaDisplay = normalized;
    if (isIncomplete) {
      this.precioVentaInvalid = normalized !== '';
      this.form.patchValue({ precioVenta: 0 }, { emitEvent: true });
      return;
    }
    const parsed = Number(normalized);
    this.precioVentaInvalid = Number.isNaN(parsed);
    this.form.patchValue({ precioVenta: Number.isFinite(parsed) ? parsed : 0 }, { emitEvent: true });
  }

  onPrecioVentaBlur(): void {
    const numericValue = this.toNumber(this.precioVentaDisplay);
    this.form.patchValue({ precioVenta: numericValue }, { emitEvent: true });
    this.precioVentaDisplay = this.formatDecimal(numericValue);
    this.precioVentaInvalid = false;
  }

  markPrecioVentaManual(): void {
    this.form.patchValue({ precioVentaEditadoManual: true }, { emitEvent: false });
  }

  recalculatePrecioVenta(): void {
    this.form.patchValue({ precioVentaEditadoManual: false }, { emitEvent: false });
    this.autoRecalculatePrecioVenta();
  }

  private autoRecalculatePrecioVenta(): void {
    const raw = this.form.getRawValue();
    const next = resolvePrecioVenta(
      Number(raw.precioCompra || 0),
      Number(raw.utilidadPorcentaje || 0),
      !!raw.precioVentaEditadoManual,
      Number(raw.precioVenta || 0),
    );

    this.form.patchValue({ precioVenta: next }, { emitEvent: false });
    this.precioVentaDisplay = this.formatDecimal(next);
  }

  async goCategorias(): Promise<void> { await this.openCatalogModal(CategoriasProductosPage); }
  async goUnidades(): Promise<void> { await this.openCatalogModal(UnidadesMedidaPage); }
  async goUtilidades(): Promise<void> { await this.openCatalogModal(UtilidadesPage); }
  async goProveedores(): Promise<void> { await this.openCatalogModal(ProveedoresPage); }

  private async openCatalogModal(component: unknown): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: component as any,
      componentProps: { modalMode: true },
      cssClass: 'catalog-admin-modal',
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  get showStockSection(): boolean {
    const tipo = this.form.controls.tipoItem.value;
    const maneja = this.form.controls.manejaInventario.value;
    return tipo === 'bien' && !!maneja;
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (this.form.invalid) {
      await this.toastService.error('Completa los campos requeridos antes de guardar.');
      return;
    }

    const raw = this.form.getRawValue();

    if (!raw.categoriaId) {
      await this.toastService.error('Selecciona una categoría.');
      return;
    }

    if (this.showStockSection && !raw.unidadMedidaId) {
      await this.toastService.error('Selecciona una unidad de medida.');
      return;
    }

    if (Number(raw.precioCompra || 0) < 0) {
      await this.toastService.error('El precio de compra no puede ser negativo.');
      return;
    }

    const existsCodigo = await this.productosServiciosService.existsCodigoInterno(raw.codigoInterno, this.itemId || undefined);
    if (existsCodigo) {
      await this.toastService.error('Este código ya está en uso.');
      return;
    }

    const payloadBase: ProductoServicio = {
      codigoInterno: raw.codigoInterno.trim(),
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion?.trim() || undefined,
      tipoItem: raw.tipoItem,
      manejaInventario: raw.tipoItem === 'servicio' ? false : raw.manejaInventario,
      categoriaId: raw.categoriaId,
      categoriaNombre: raw.categoriaNombre,
      unidadMedidaId: raw.unidadMedidaId || undefined,
      unidadMedidaCodigo: raw.unidadMedidaCodigo || undefined,
      unidadMedidaNombre: raw.unidadMedidaNombre || undefined,
      utilidadId: raw.utilidadId || undefined,
      utilidadNombre: raw.utilidadNombre || undefined,
      utilidadPorcentaje: Number(raw.utilidadPorcentaje || 0),
      proveedorId: raw.proveedorId || undefined,
      proveedorNombre: raw.proveedorNombre || undefined,
      proveedorRnc: raw.proveedorRnc || undefined,
      proveedorTelefono: raw.proveedorTelefono || undefined,
      proveedorEmail: raw.proveedorEmail || undefined,
      moneda: raw.moneda,
      stockActual: this.showStockSection ? Number(raw.stockActual || 0) : 0,
      stockMinimo: this.showStockSection ? Number(raw.stockMinimo || 0) : 0,
      stockMaximo: this.showStockSection ? Number(raw.stockMaximo || 0) : 0,
      precioCompra: Number(raw.precioCompra || 0),
      precioVenta: Number(raw.precioVenta || 0),
      precioVentaEditadoManual: !!raw.precioVentaEditadoManual,
      indicadorBienServicioECF: raw.tipoItem === 'servicio' ? 2 : 1,
      indicadorFacturacion: raw.indicadorFacturacion,
      tasaItbis: raw.tasaItbis,
      esExento: raw.esExento,
      esNoFacturable: raw.esNoFacturable,
      activo: raw.activo,
      creadoPor: 'sistema',
      fechaCreacion: new Date().toISOString(),
      actualizadoPor: 'sistema',
      fechaActualizacion: new Date().toISOString(),
    };

    const payload = applyFiscalDefaults(payloadBase, this.catalogoFiscalService);
    const errors = validateProductoServicio(payload);
    if (errors.length) {
      await this.toastService.error(errors[0]);
      return;
    }

    this.isSaving = true;
    try {
      if (this.itemId) {
        await this.productosServiciosService.update(this.itemId, payload);
        await this.toastService.success('Producto/servicio actualizado.');
        this.form.markAsPristine();
        this.form.markAsUntouched();
      } else {
        await this.productosServiciosService.create(payload);
        await this.toastService.success('Producto/servicio creado.');
        await this.resetFormulario();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      this.isSaving = false;
    }
  }

  formatDecimal(value: unknown): string {
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
  }

  toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    return Number(String(value).replace(/[^\d.-]/g, '')) || 0;
  }

  private formatEditableNumber(value: unknown): string {
    const numberValue = this.toNumber(value);
    if (!numberValue) return '';
    return Number.isInteger(numberValue) ? String(numberValue) : String(numberValue);
  }

  private applyProveedorFilter(): void {
    const q = this.proveedorQuery.trim().toLowerCase();
    if (!q) {
      this.filteredProveedores = [...this.proveedoresCache];
      return;
    }
    this.filteredProveedores = this.proveedoresCache.filter((item) =>
      [item.nombre, item.rnc, item.telefono, item.email]
        .some((value) => String(value || '').toLowerCase().includes(q)),
    );
  }
}
