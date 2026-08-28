import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Cita } from '../../agenda/models/cita.model';
import { AgendaService } from '../../agenda/services/agenda.service';
import { Insumo } from '../models/insumo.model';
import { MovimientoInventario } from '../models/movimiento-inventario.model';
import { InventarioService } from '../services/inventario.service';
import { MovimientosInventarioService } from '../services/movimientos-inventario.service';

@Component({
  standalone: false,
  selector: 'app-movimiento-form',
  templateUrl: './movimiento-form.page.html',
  styleUrls: ['./movimiento-form.page.scss'],
})
export class MovimientoFormPage {
  readonly insumos$ = this.inventarioService.list();
  readonly citas$ = this.agendaService.list();
  private citasCache: Cita[] = [];
  private insumosCache: Insumo[] = [];
  private readonly sub = new Subscription();

  productoModalOpen = false;
  tipoModalOpen = false;
  productoQuery = '';
  tipoQuery = '';
  filteredProductos: Insumo[] = [];
  filteredTipos: Array<{ value: MovimientoInventario['tipo']; label: string }> = [];

  readonly tiposMovimiento: Array<{ value: MovimientoInventario['tipo']; label: string }> = [
    { value: 'entrada', label: 'Entrada' },
    { value: 'salida', label: 'Salida' },
  ];

  readonly form = this.fb.nonNullable.group({
    insumoId: ['', Validators.required],
    tipo: ['entrada' as MovimientoInventario['tipo'], Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    motivo: ['ajuste interno', Validators.required],
    artistaId: [''],
    citaId: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly inventarioService: InventarioService,
    private readonly movimientosService: MovimientosInventarioService,
    private readonly agendaService: AgendaService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {
    this.sub.add(
      this.citas$.subscribe((items) => {
        this.citasCache = items;
      }),
    );
    this.sub.add(
      this.insumos$.subscribe((items) => {
        this.insumosCache = items ?? [];
        this.applyProductoFilter();
      }),
    );
    this.applyTipoFilter();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  findInsumo(insumos: Insumo[] | null, id: string): Insumo | undefined {
    return (insumos ?? []).find((item) => item.id === id);
  }

  citasByArtist(citas: Cita[] | null, artistaId: string): Cita[] {
    if (!artistaId) return citas ?? [];
    return (citas ?? []).filter((item) => item.artistaId === artistaId);
  }

  onCitaChange(citaId: string): void {
    const cita = this.citasCache.find((item) => item.id === citaId);
    this.form.patchValue({ artistaId: cita?.artistaId ?? '' });
  }

  openProductoModal(): void {
    this.productoQuery = '';
    this.applyProductoFilter();
    this.productoModalOpen = true;
  }

  closeProductoModal(): void {
    this.productoModalOpen = false;
  }

  onProductoSearch(event: Event): void {
    const value = String((event as CustomEvent).detail?.value || '');
    this.productoQuery = value;
    this.applyProductoFilter();
  }

  selectProducto(item: Insumo): void {
    this.form.patchValue({ insumoId: item.id || '' });
    this.closeProductoModal();
  }

  openTipoModal(): void {
    this.tipoQuery = '';
    this.applyTipoFilter();
    this.tipoModalOpen = true;
  }

  closeTipoModal(): void {
    this.tipoModalOpen = false;
  }

  onTipoSearch(event: Event): void {
    const value = String((event as CustomEvent).detail?.value || '');
    this.tipoQuery = value;
    this.applyTipoFilter();
  }

  selectTipo(value: MovimientoInventario['tipo']): void {
    this.form.patchValue({ tipo: value });
    this.closeTipoModal();
  }

  get selectedProductoLabel(): string {
    const id = this.form.controls.insumoId.value;
    const selected = this.insumosCache.find((item) => item.id === id);
    return selected?.nombre || 'Selecciona un producto o servicio';
  }

  get selectedTipoLabel(): string {
    const selected = this.tiposMovimiento.find((item) => item.value === this.form.controls.tipo.value);
    return selected?.label || 'Selecciona tipo';
  }

  isTipoSelected(value: MovimientoInventario['tipo']): boolean {
    return this.form.controls.tipo.value === value;
  }

  getProductoCodigo(item: Insumo): string {
    return String((item as unknown as { codigoInterno?: string }).codigoInterno || 'Sin código');
  }

  getProductoProveedor(item: Insumo): string {
    return String((item as unknown as { proveedorNombre?: string }).proveedorNombre || 'Sin proveedor');
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa los datos del movimiento.');
      return;
    }

    const raw = this.form.getRawValue();
    const insumos = await firstValueFrom(this.inventarioService.list());
    const insumo = insumos.find((item) => item.id === raw.insumoId);

    if (!insumo?.id) {
      await this.toastService.error('Selecciona un insumo válido.');
      return;
    }

    const currentUser = await firstValueFrom(this.authService.user$);

    const payload: MovimientoInventario = {
      insumoId: insumo.id,
      insumoNombre: insumo.nombre,
      tipo: raw.tipo,
      cantidad: Number(raw.cantidad),
      motivo: raw.motivo.trim(),
      artistaId: raw.artistaId || undefined,
      citaId: raw.citaId || undefined,
      fecha: new Date().toISOString(),
      creadoPor: currentUser?.uid ?? 'sistema',
    };

    try {
      await this.movimientosService.registrarMovimiento(payload);
      await this.toastService.success('Movimiento registrado.');
      await this.router.navigateByUrl('/admin/inventario/movimientos');
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'NEGATIVE_STOCK') {
        await this.toastService.error('Stock insuficiente para esta salida.');
        return;
      }
      await this.toastService.error('No fue posible registrar el movimiento.');
    }
  }

  private applyProductoFilter(): void {
    const q = this.productoQuery.trim().toLowerCase();
    if (!q) {
      this.filteredProductos = [...this.insumosCache];
      return;
    }
    this.filteredProductos = this.insumosCache.filter((item) =>
      [
        item.nombre,
        item.categoria,
        item.unidadMedida,
        (item as any).codigoInterno,
        (item as any).proveedorNombre,
      ].some((field) => String(field || '').toLowerCase().includes(q)),
    );
  }

  private applyTipoFilter(): void {
    const q = this.tipoQuery.trim().toLowerCase();
    if (!q) {
      this.filteredTipos = [...this.tiposMovimiento];
      return;
    }
    this.filteredTipos = this.tiposMovimiento.filter((item) => item.label.toLowerCase().includes(q));
  }
}
