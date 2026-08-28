import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { MovimientoInventario, TipoMovimientoInventario } from '../../models/movimiento-inventario.model';
import { ProductoServicio } from '../../models/producto-servicio.model';
import { MovimientosInventarioService } from '../../services/movimientos-inventario.service';
import { ProductosServiciosService } from '../../services/productos-servicios.service';

@Component({
  selector: 'app-movimiento-inventario-form',
  templateUrl: './movimiento-inventario-form.page.html',
  styleUrls: ['./movimiento-inventario-form.page.scss'],
  standalone: false,
})
export class MovimientoInventarioFormPage {
  readonly items$ = this.productosServiciosService.list();
  readonly tipos: TipoMovimientoInventario[] = [
    'entrada_compra',
    'decomiso',
    'averia',
    'vencimiento',
    'uso_interno',
    'robo',
    'perdida',
    'merma',
    'ajuste_fisico',
    'salida_venta',
  ];
  productoModalOpen = false;
  productoQuery = '';
  itemsCache: ProductoServicio[] = [];
  filteredItems: ProductoServicio[] = [];

  readonly form = this.fb.nonNullable.group({
    productoId: ['', Validators.required],
    tipoMovimiento: ['decomiso' as TipoMovimientoInventario, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    motivo: ['ajuste operativo', Validators.required],
    referenciaTipo: ['manual'],
    referenciaId: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly movimientosService: MovimientosInventarioService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {
    this.items$.subscribe((items) => {
      this.itemsCache = items || [];
      this.applyProductoFilter();
    });
  }

  openProductoModal(): void {
    this.productoModalOpen = true;
    this.productoQuery = '';
    this.applyProductoFilter();
  }

  closeProductoModal(): void {
    this.productoModalOpen = false;
  }

  onProductoSearch(event: Event): void {
    const value = String((event as CustomEvent).detail?.value || '');
    this.productoQuery = value;
    this.applyProductoFilter();
  }

  selectProducto(item: ProductoServicio): void {
    this.form.patchValue({ productoId: item.id || '' });
    this.closeProductoModal();
  }

  get selectedProductoLabel(): string {
    const id = this.form.controls.productoId.value;
    const found = this.itemsCache.find((item) => item.id === id);
    return found ? this.labelForItem(found) : 'Selecciona un producto o servicio';
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa los datos del movimiento.');
      return;
    }

    const raw = this.form.getRawValue();
    const items = await firstValueFrom(this.productosServiciosService.list());
    const item = items.find((x) => x.id === raw.productoId);

    if (!item?.id) {
      await this.toastService.error('Selecciona un producto/servicio válido.');
      return;
    }

    const user = await firstValueFrom(this.authService.user$);

    const payload: MovimientoInventario = {
      productoId: item.id,
      productoNombre: item.nombre,
      tipoMovimiento: raw.tipoMovimiento,
      cantidad: Number(raw.cantidad),
      motivo: raw.motivo.trim(),
      referenciaTipo: raw.referenciaTipo || undefined,
      referenciaId: raw.referenciaId || undefined,
      fecha: new Date().toISOString(),
      creadoPor: user?.uid ?? 'sistema',
    };

    try {
      await this.movimientosService.registrarMovimientoFiscal(payload);
      await this.toastService.success('Movimiento fiscal registrado.');
      await this.router.navigateByUrl('/admin/inventario/movimientos-inventario');
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'NEGATIVE_STOCK') {
        await this.toastService.error('Stock insuficiente para este movimiento.');
        return;
      }
      await this.toastService.error('No fue posible registrar el movimiento.');
    }
  }

  labelForItem(item: ProductoServicio): string {
    return `${item.nombre} (${item.codigoInterno})`;
  }

  private applyProductoFilter(): void {
    const q = this.productoQuery.trim().toLowerCase();
    if (!q) {
      this.filteredItems = [...this.itemsCache];
      return;
    }
    this.filteredItems = this.itemsCache.filter((item) =>
      [item.nombre, item.codigoInterno, item.categoriaNombre, item.proveedorNombre]
        .some((value) => String(value || '').toLowerCase().includes(q)),
    );
  }
}
