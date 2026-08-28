import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ActionSheetController } from '@ionic/angular';
import { firstValueFrom, map, Observable, shareReplay, Subscription } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { detectProductosDeOtroProveedor, mapProductoToCompraItem, mapProveedorToCompra, validateCompraBeforeConfirm } from '../../helpers/compras.helper';
import { CompraItem } from '../../models/compra-item.model';
import { Compra } from '../../models/compra.model';
import { ProductoServicio } from '../../models/producto-servicio.model';
import { Proveedor } from '../../models/proveedor.model';
import { Utilidad } from '../../models/utilidad.model';
import { ComprasService } from '../../services/compras.service';
import { PdfCompraService } from '../../services/pdf-compra.service';
import { ProductosServiciosService } from '../../services/productos-servicios.service';
import { ProveedoresService } from '../../services/proveedores.service';
import { UtilidadesService } from '../../services/utilidades.service';
import {
  calculateCompraItemItbis,
  calculateCompraItemSubtotal,
  calculateCompraItemTotal,
  calculateCompraTotals,
  calculateSalePrice,
  TotalesCompra,
} from '../../utils/purchase-calculation.utils';
import { formatDopCurrency } from '../../utils/currency-format.utils';
import { calculateAdditionalTaxes } from '../../utils/tax-calculation.utils';

type ProductoSeleccionableUi = ProductoServicio & {
  selectorEyebrow: string;
  selectorDescription: string;
  selectorMeta1: string;
  selectorMeta2: string;
  selectorMeta3: string;
  selectorMeta4: string;
  selectorMeta5: string;
  selectorMeta6: string;
};

@Component({
  selector: 'app-compra-form',
  templateUrl: './compra-form.page.html',
  styleUrls: ['./compra-form.page.scss'],
  standalone: false,
})
export class CompraFormPage implements OnInit, OnDestroy {
  readonly proveedoresActivos$: Observable<Proveedor[]> = this.proveedoresService.getProveedoresActivos().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly productosActivos$: Observable<ProductoServicio[]> = this.productosService.list().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly productosSeleccionables$: Observable<ProductoServicio[]> = this.productosActivos$.pipe(
    map((items) => items.filter((item) => item.activo)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly productosSeleccionablesUi$: Observable<ProductoSeleccionableUi[]> = this.productosSeleccionables$.pipe(
    map((items) => items.map((item) => ({
      ...item,
      selectorEyebrow: item.codigoInterno || 'Sin codigo',
      selectorDescription: this.buildProductoSelectorDescription(item),
      selectorMeta1: this.getTipoProductoLabel(item),
      selectorMeta2: item.categoriaNombre || 'Sin categoria',
      selectorMeta3: item.proveedorNombre || 'Sin proveedor',
      selectorMeta4: item.manejaInventario ? this.getStockLabel(item) : 'Servicio',
      selectorMeta5: this.getItbisLabel(item),
      selectorMeta6: this.formatMoney(item.precioVenta || 0),
    }))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly utilidadesActivas$: Observable<Utilidad[]> = this.utilidadesService.getUtilidadesActivas().pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly items: CompraItem[] = [];
  selectedProveedorId = '';
  selectedProducto: ProductoServicio | null = null;
  warningProveedorMix = false;
  editIndex: number | null = null;
  editingItem: CompraItem | null = null;
  private totalsSnapshot: TotalesCompra = { subtotal: 0, totalDescuento: 0, totalItbis: 0, totalImpuestosAdicionales: 0, total: 0 };
  private readonly sub = new Subscription();
  private productosCache: ProductoServicio[] = [];
  private utilidadesCache: Utilidad[] = [];

  readonly form = this.fb.nonNullable.group({
    proveedorId: ['', Validators.required],
    proveedorNombre: ['', Validators.required],
    proveedorRnc: [''],
    numeroFactura: ['', Validators.required],
    ncf: [''],
    fechaEmision: [new Date().toISOString(), Validators.required],
    fechaVencimiento: [''],
    condicionPago: ['contado' as 'contado' | 'credito', Validators.required],
    moneda: ['DOP' as 'DOP' | 'USD' | 'EUR' | 'CAD' | 'GBP', Validators.required],
    tasaCambio: [1],
    afectaInventario: [true],
    productoId: ['', Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    precioCompra: [0, [Validators.required, Validators.min(0)]],
    utilidadId: [''],
    utilidadPorcentaje: [0],
    descuento: [0],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly productosService: ProductosServiciosService,
    private readonly proveedoresService: ProveedoresService,
    private readonly utilidadesService: UtilidadesService,
    private readonly comprasService: ComprasService,
    private readonly pdfCompraService: PdfCompraService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.productosActivos$.subscribe((items) => {
        this.productosCache = items || [];
      }),
    );

    this.sub.add(
      this.utilidadesActivas$.subscribe((items) => {
        this.utilidadesCache = items || [];
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onProveedorSelected(proveedor: Proveedor): void {
    const mapped = mapProveedorToCompra(proveedor);
    this.selectedProveedorId = mapped.proveedorId;
    this.form.patchValue({
      proveedorId: mapped.proveedorId,
      proveedorNombre: mapped.proveedorNombre,
      proveedorRnc: mapped.proveedorRnc || '',
      condicionPago: mapped.condicionPago,
      moneda: mapped.moneda,
      fechaVencimiento: mapped.condicionPago === 'credito' && proveedor.diasCreditoDefault
        ? new Date(Date.now() + proveedor.diasCreditoDefault * 24 * 60 * 60 * 1000).toISOString()
        : this.form.controls.fechaVencimiento.value,
    });
    this.warningProveedorMix = detectProductosDeOtroProveedor(this.items, this.selectedProveedorId);
  }

  async onProductoSelected(producto: ProductoServicio): Promise<void> {
    this.selectedProducto = producto;
    this.form.patchValue({
      productoId: producto.id || '',
      precioCompra: Number(producto.precioCompra ?? producto.ultimoCosto ?? 0),
      utilidadId: producto.utilidadId || '',
      utilidadPorcentaje: Number(producto.utilidadPorcentaje || 0),
    });

    if (!this.selectedProveedorId && producto.proveedorId) {
      this.selectedProveedorId = producto.proveedorId;
      this.form.patchValue({
        proveedorId: producto.proveedorId,
        proveedorNombre: producto.proveedorNombre || '',
        proveedorRnc: producto.proveedorRnc || '',
      });
      await this.toastService.success('Proveedor sugerido automáticamente desde el producto.');
    } else if (this.selectedProveedorId && producto.proveedorId && this.selectedProveedorId !== producto.proveedorId) {
      await this.toastService.error('Este producto pertenece a otro proveedor.');
    }
  }

  get precioVentaSugeridoLinea(): number {
    return calculateSalePrice(Number(this.form.controls.precioCompra.value || 0), Number(this.form.controls.utilidadPorcentaje.value || 0));
  }

  async onUtilidadSelected(utilidad: Utilidad): Promise<void> {
    this.form.patchValue({ utilidadId: utilidad.id || '', utilidadPorcentaje: utilidad.porcentaje });
  }

  async addItem(): Promise<void> {
    if (!this.form.controls.productoId.value) {
      await this.toastService.error('Selecciona un producto o servicio.');
      return;
    }

    const producto = this.resolveSelectedProducto();
    if (!producto?.id) {
      await this.toastService.error('Producto/servicio inválido.');
      return;
    }

    const utilidad = this.resolveSelectedUtilidad();

    const cantidad = Number(this.form.controls.cantidad.value || 0);
    const precioCompra = Number(this.form.controls.precioCompra.value || 0);
    const descuento = this.asSafeNumber(this.form.controls.descuento.value, 0);

    if (cantidad <= 0) {
      await this.toastService.error('La cantidad debe ser mayor a cero.');
      return;
    }
    if (precioCompra < 0) {
      await this.toastService.error('El precio de compra no puede ser negativo.');
      return;
    }

    const draft = mapProductoToCompraItem(producto, cantidad, precioCompra, descuento, utilidad);
    draft.actualizarUtilidadProducto = true;
    draft.actualizarPrecioVentaProducto = true;

    this.items.push(draft);
    this.recalculateCompraTotals();
    this.warningProveedorMix = detectProductosDeOtroProveedor(this.items, this.form.controls.proveedorId.value || this.selectedProveedorId);

    this.form.patchValue({
      productoId: '',
      cantidad: 1,
      precioCompra: 0,
      utilidadId: '',
      utilidadPorcentaje: 0,
      descuento: 0,
    });
    this.selectedProducto = null;
  }

  editCompraItem(index: number): void {
    const source = this.items[index];
    if (!source) return;
    this.editIndex = index;
    this.editingItem = { ...source };
  }

  cancelEditCompraItem(): void {
    this.editIndex = null;
    this.editingItem = null;
  }

  saveEditedCompraItem(): void {
    if (this.editIndex === null || !this.editingItem) return;

    if (Number(this.editingItem.cantidad || 0) <= 0) {
      void this.toastService.error('La cantidad debe ser mayor a cero.');
      return;
    }

    this.recalculateEditingItem();
    this.items[this.editIndex] = { ...this.editingItem };
    this.recalculateCompraTotals();
    this.cancelEditCompraItem();
    void this.toastService.success('Producto actualizado en la compra.');
  }

  removeCompraItem(index: number): void {
    this.items.splice(index, 1);
    this.recalculateCompraTotals();
    if (this.editIndex === index) this.cancelEditCompraItem();
    this.warningProveedorMix = detectProductosDeOtroProveedor(this.items, this.form.controls.proveedorId.value || this.selectedProveedorId);
  }

  onItemPrecioCompraChange(index: number, rawValue: string | number | null | undefined): void {
    const value = this.asSafeNumber(rawValue, 0);
    const item = this.items[index];
    if (!item) return;
    item.precioCompra = value;
    item.costoUnitario = value;
    this.recalculateItem(index);
  }

  onItemDescuentoChange(index: number, rawValue: string | number | null | undefined): void {
    const value = this.asSafeNumber(rawValue, 0);
    const item = this.items[index];
    if (!item) return;
    item.descuento = value;
    this.recalculateItem(index);
  }

  onItemCantidadChange(index: number, rawValue: string | number | null | undefined): void {
    const value = this.asSafeNumber(rawValue, 0);
    const item = this.items[index];
    if (!item) return;
    item.cantidad = value;
    this.recalculateItem(index);
  }

  onItemUtilidadChange(index: number, utilidad: Utilidad): void {
    const item = this.items[index];
    if (!item) return;
    item.utilidadId = utilidad.id;
    item.utilidadNombre = utilidad.nombre;
    item.utilidadPorcentaje = utilidad.porcentaje;
    this.recalculateItem(index);
  }

  onItemTasaItbisChange(index: number, rawValue: string | number | null | undefined): void {
    const item = this.items[index];
    if (!item) return;
    const rawRate = this.asSafeNumber(rawValue, item.tasaItbis);
    item.tasaItbis = rawRate >= 18 ? 18 : rawRate >= 16 ? 16 : 0;
    this.recalculateItem(index);
  }

  recalculateItem(index: number): void {
    const item = this.items[index];
    if (!item) return;

    item.subtotal = calculateCompraItemSubtotal(item.cantidad, item.costoUnitario, item.descuento || 0);
    item.montoItbis = calculateCompraItemItbis(item.subtotal, item.tasaItbis);
    item.montoImpuestosAdicionales = calculateAdditionalTaxes(item);
    item.total = calculateCompraItemTotal(item.subtotal, item.montoItbis, item.montoImpuestosAdicionales);
    item.precioVentaSugerido = calculateSalePrice(item.costoUnitario, Number(item.utilidadPorcentaje || 0));
    this.recalculateCompraTotals();
  }

  onEditUtilidadSelected(utilidad: Utilidad): void {
    if (!this.editingItem) return;
    this.editingItem.utilidadId = utilidad.id;
    this.editingItem.utilidadNombre = utilidad.nombre;
    this.editingItem.utilidadPorcentaje = utilidad.porcentaje;
    this.recalculateEditingItem();
  }

  setEditingTasaItbis(rawValue: string | number | null | undefined): void {
    if (!this.editingItem) return;
    const rawRate = this.asSafeNumber(rawValue, this.editingItem.tasaItbis);
    this.editingItem.tasaItbis = rawRate >= 18 ? 18 : rawRate >= 16 ? 16 : 0;
    this.recalculateEditingItem();
  }

  recalculateEditingItem(): void {
    if (!this.editingItem) return;
    this.editingItem.subtotal = calculateCompraItemSubtotal(this.editingItem.cantidad, this.editingItem.costoUnitario, this.editingItem.descuento || 0);
    this.editingItem.montoItbis = calculateCompraItemItbis(this.editingItem.subtotal, this.editingItem.tasaItbis);
    this.editingItem.montoImpuestosAdicionales = calculateAdditionalTaxes(this.editingItem);
    this.editingItem.total = calculateCompraItemTotal(this.editingItem.subtotal, this.editingItem.montoItbis, this.editingItem.montoImpuestosAdicionales);
    this.editingItem.precioVentaSugerido = calculateSalePrice(this.editingItem.costoUnitario, Number(this.editingItem.utilidadPorcentaje || 0));
  }

  get totals(): TotalesCompra {
    return this.totalsSnapshot;
  }

  /**
   * Recalcula totales generales siempre desde números puros de líneas.
   */
  recalculateCompraTotals(): void {
    this.totalsSnapshot = calculateCompraTotals(this.items);
  }

  formatMoney(value: number): string {
    return formatDopCurrency(value);
  }

  get selectedProductoCostoBase(): number {
    return Number(this.selectedProducto?.precioCompra ?? this.selectedProducto?.ultimoCosto ?? this.selectedProducto?.costoPromedio ?? 0);
  }

  get selectedProductoVentaActual(): number {
    return Number(this.selectedProducto?.precioVenta ?? 0);
  }

  get selectedProductoUtilidadActual(): number {
    return Number(this.selectedProducto?.utilidadPorcentaje ?? 0);
  }

  get selectedProductoStockStatus(): string {
    if (!this.selectedProducto) return '';
    if (!this.selectedProducto.manejaInventario) return 'No maneja inventario';
    return this.getStockLabel(this.selectedProducto);
  }

  get selectedProductoTipoLabel(): string {
    if (!this.selectedProducto) return '';
    return this.getTipoProductoLabel(this.selectedProducto);
  }

  get selectedProductoImpuestoLabel(): string {
    if (!this.selectedProducto) return '';
    return this.getItbisLabel(this.selectedProducto);
  }

  buildCompraPayload(estado: Compra['estado']): Compra {
    const raw = this.form.getRawValue();
    this.recalculateCompraTotals();
    const totals = this.totalsSnapshot;

    return {
      proveedorId: raw.proveedorId,
      proveedorNombre: raw.proveedorNombre,
      proveedorRnc: raw.proveedorRnc || undefined,
      numeroFactura: raw.numeroFactura,
      ncf: raw.ncf || undefined,
      fechaEmision: raw.fechaEmision,
      fechaVencimiento: raw.fechaVencimiento || undefined,
      condicionPago: raw.condicionPago,
      moneda: raw.moneda,
      tasaCambio: Number(raw.tasaCambio || 1),
      items: this.items.map((item) => ({ ...item })),
      subtotal: totals.subtotal,
      totalDescuento: totals.totalDescuento,
      totalItbis: totals.totalItbis,
      totalImpuestosAdicionales: totals.totalImpuestosAdicionales,
      total: totals.total,
      estado,
      afectaInventario: !!raw.afectaInventario,
      inventarioAfectado: false,
      creadoPor: 'sistema',
      fechaCreacion: new Date().toISOString(),
    };
  }

  validateCompraBeforeSave(compra: Compra, confirmar = false): string[] {
    const errors: string[] = [];

    if (!compra.proveedorId) errors.push('Selecciona un proveedor.');
    if (!compra.fechaEmision) errors.push('Fecha de emisión requerida.');
    if (!compra.items.length) errors.push('Agrega al menos un producto o servicio.');

    if (confirmar) {
      if (!compra.numeroFactura) errors.push('Número de factura requerido.');
      errors.push(...validateCompraBeforeConfirm(compra));
    }

    for (const item of compra.items) {
      if (!item.productoId) errors.push('Hay líneas sin producto.');
      if (!(Number(item.cantidad || 0) > 0)) errors.push('La cantidad debe ser mayor a cero.');
      if (Number(item.costoUnitario || 0) < 0) errors.push('El precio de compra no puede ser negativo.');
    }

    return [...new Set(errors)];
  }

  async saveCompra(): Promise<void> {
    const user = await firstValueFrom(this.authService.user$);
    const payload = this.buildCompraPayload('borrador');
    payload.creadoPor = user?.uid ?? 'sistema';

    const validationErrors = this.validateCompraBeforeSave(payload, false);
    if (validationErrors.length) {
      await this.toastService.error(validationErrors[0]);
      return;
    }

    const id = await this.comprasService.createCompraBorrador(payload);
    const compraGenerada: Compra = { ...payload, id };
    await this.toastService.success('Compra guardada correctamente.');
    await this.presentPdfOptions(compraGenerada);
    await this.router.navigate(['/admin/inventario/compras', id]);
  }

  async confirmarCompra(): Promise<void> {
    const user = await firstValueFrom(this.authService.user$);
    const payload = this.buildCompraPayload('borrador');
    payload.creadoPor = user?.uid ?? 'sistema';

    const validationErrors = this.validateCompraBeforeSave(payload, true);
    if (validationErrors.length) {
      await this.toastService.error(validationErrors[0]);
      return;
    }

    const id = await this.comprasService.createCompraBorrador(payload);
    await this.comprasService.confirmarCompra(id);
    const compraConfirmada = await firstValueFrom(this.comprasService.getCompraById(id));
    await this.toastService.success('Compra confirmada e inventario actualizado.');
    await this.presentPdfOptions(compraConfirmada);
    await this.router.navigate(['/admin/inventario/compras', id]);
  }

  private async presentPdfOptions(compra: Compra): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Factura de compra',
      subHeader: 'Selecciona una acción',
      buttons: [
        {
          text: 'Imprimir factura',
          icon: 'print-outline',
          handler: () => this.pdfCompraService.imprimirCompra(compra),
        },
        {
          text: 'Guardar PDF',
          icon: 'download-outline',
          handler: () => this.pdfCompraService.guardarPdfCompra(compra),
        },
        {
          text: 'Ver preview e-CF / comprobante',
          icon: 'reader-outline',
          handler: () => this.router.navigate(['/admin/inventario/ecf-preview', compra.id]),
        },
        {
          text: 'Abrir preview PDF',
          icon: 'document-text-outline',
          handler: () => this.pdfCompraService.abrirPreviewCompra(compra),
        },
        { text: 'Finalizar sin imprimir', role: 'cancel', icon: 'close-outline' },
      ],
    });

    await sheet.present();
  }

  setEditingActualizarUtilidad(checked: boolean): void {
    if (!this.editingItem) return;
    this.editingItem.actualizarUtilidadProducto = checked;
  }

  setEditingActualizarPrecio(checked: boolean): void {
    if (!this.editingItem) return;
    this.editingItem.actualizarPrecioVentaProducto = checked;
  }

  goProveedores(): void {
    this.router.navigate(['/admin/inventario/proveedores'], {
      queryParams: { returnTo: '/admin/inventario/compras/nuevo' },
    });
  }

  goProductos(): void {
    this.router.navigateByUrl('/admin/inventario/productos-servicios');
  }

  private buildProductoSelectorDescription(item: ProductoServicio): string {
    const partes = [
      item.categoriaNombre || 'Sin categoria',
      item.proveedorNombre || 'Sin proveedor',
      this.formatMoney(item.precioVenta || 0),
    ];

    return partes.filter(Boolean).join(' • ');
  }

  private getTipoProductoLabel(item: ProductoServicio): string {
    return item.manejaInventario ? 'Producto' : 'Servicio';
  }

  private getStockLabel(item: ProductoServicio): string {
    const stockActual = Number(item.stockActual || 0);
    const stockMinimo = Number(item.stockMinimo || 0);
    if (stockActual <= stockMinimo) return `Stock bajo: ${stockActual}`;
    return `Stock: ${stockActual}`;
  }

  private getItbisLabel(item: ProductoServicio): string {
    return Number(item.tasaItbis || 0) > 0 ? `ITBIS ${item.tasaItbis}%` : 'Sin ITBIS';
  }

  private asSafeNumber(value: string | number | null | undefined, fallback = 0): number {
    const normalized = String(value ?? '')
      .replace(/\s/g, '')
      .replace(/RD\$/gi, '')
      .replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private resolveSelectedProducto(): ProductoServicio | null {
    const selectedId = this.form.controls.productoId.value;
    if (this.selectedProducto?.id === selectedId) {
      return this.selectedProducto;
    }

    return this.productosCache.find((item) => item.id === selectedId) || null;
  }

  private resolveSelectedUtilidad(): Utilidad | undefined {
    const selectedId = this.form.controls.utilidadId.value;
    return this.utilidadesCache.find((item) => item.id === selectedId);
  }
}
