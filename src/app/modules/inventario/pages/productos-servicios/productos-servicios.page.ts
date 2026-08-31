import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { ToastService } from '../../../../core/services/toast.service';
import { ProductoServicio } from '../../models/producto-servicio.model';
import { ProductosServiciosService } from '../../services/productos-servicios.service';

@Component({
  selector: 'app-productos-servicios',
  templateUrl: './productos-servicios.page.html',
  styleUrls: ['./productos-servicios.page.scss'],
  standalone: false,
})
export class ProductosServiciosPage implements OnInit, OnDestroy {
  items: ProductoServicio[] = [];
  itemsFiltrados: ProductoServicio[] = [];
  loading = true;

  query = '';
  filtroTipo: 'todos' | 'producto' | 'servicio' = 'todos';
  filtroCategoria = 'todas';
  filtroEstado: 'todos' | 'activo' | 'inactivo' = 'todos';
  filtroStock: 'todos' | 'normal' | 'bajo' = 'todos';
  categoriasDisponibles: string[] = [];
  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];

  private sub?: Subscription;

  constructor(
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly toastService: ToastService,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly alertCtrl: AlertController,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.sub = this.productosServiciosService.getProductosServicios().subscribe({
      next: (items) => {
        this.items = [...items].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
        this.categoriasDisponibles = Array.from(new Set(
          this.items.map((item) => String(item.categoriaNombre || '').trim()).filter(Boolean),
        )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        this.applyFilters();
        this.loading = false;
      },
      error: async () => {
        this.loading = false;
        await this.toastService.error('No fue posible cargar el catálogo.');
      },
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.query = (target.value ?? '').toString();
    this.applyFilters();
  }

  onTipoChange(value: 'todos' | 'producto' | 'servicio'): void {
    this.filtroTipo = value;
    this.applyFilters();
  }

  onCategoriaChange(value: string): void {
    this.filtroCategoria = value || 'todas';
    this.applyFilters();
  }

  onEstadoChange(value: 'todos' | 'activo' | 'inactivo'): void {
    this.filtroEstado = value;
    this.applyFilters();
  }

  onStockChange(value: 'todos' | 'normal' | 'bajo'): void {
    this.filtroStock = value;
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return Boolean(this.query.trim())
      || this.filtroTipo !== 'todos'
      || this.filtroCategoria !== 'todas'
      || this.filtroEstado !== 'todos'
      || this.filtroStock !== 'todos';
  }

  clearFilters(): void {
    this.query = '';
    this.filtroTipo = 'todos';
    this.filtroCategoria = 'todas';
    this.filtroEstado = 'todos';
    this.filtroStock = 'todos';
    this.applyFilters();
  }

  goToNew(): void {
    this.router.navigateByUrl('/admin/inventario/productos-servicios/nuevo');
  }

  goToInventario(): void {
    this.router.navigateByUrl('/admin/inventario');
  }

  onEdit(item: ProductoServicio): void {
    if (!item.id) return;
    this.router.navigate(['/admin/inventario/productos-servicios', item.id]);
  }

  async openActions(item: ProductoServicio): Promise<void> {
    const isActive = Boolean(item.activo);
    const buttons: any[] = [
      { text: 'Editar', icon: 'create-outline', handler: () => this.onEdit(item) },
      {
        text: isActive ? 'Inactivar' : 'Activar',
        icon: isActive ? 'pause-circle-outline' : 'play-circle-outline',
        handler: () => this.onToggleActivo(item),
      },
      { text: 'Eliminar', icon: 'trash-outline', role: 'destructive', handler: () => this.onDelete(item) },
      { text: 'Cerrar', icon: 'close-outline', role: 'cancel' },
    ];
    const sheet = await this.actionSheetCtrl.create({
      header: item.nombre || 'Acciones del catálogo',
      subHeader: item.codigoInterno || 'Producto o servicio',
      cssClass: 'inventory-actions-sheet',
      buttons,
    });
    await sheet.present();
  }

  async onToggleActivo(item: ProductoServicio): Promise<void> {
    if (!item.id) return;
    try {
      if (item.activo) {
        await this.productosServiciosService.inactivarProductoServicio(item.id);
      } else {
        await this.productosServiciosService.activarProductoServicio(item.id);
      }
      await this.toastService.success(item.activo ? 'Registro inactivado.' : 'Registro activado.');
    } catch {
      await this.toastService.error('No fue posible actualizar el estado.');
    }
  }

  async onDelete(item: ProductoServicio): Promise<void> {
    if (!item.id) return;

    const alert = await this.alertCtrl.create({
      cssClass: 'inventory-confirm-alert',
      header: 'Eliminar registro',
      message: `Se eliminará ${item.nombre}. Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.productosServiciosService.deleteProductoServicio(item.id as string);
              await this.toastService.success('Registro eliminado.');
            } catch {
              await this.toastService.error('No fue posible eliminar. Puede tener referencias en compras.');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  exportarExcel(): void {
    const rows = this.itemsFiltrados.map((item) => ({
      Codigo: item.codigoInterno || '',
      Nombre: item.nombre || '',
      Tipo: this.getTipoLabel(item),
      Categoria: item.categoriaNombre || '',
      PrecioVenta: this.toNumber(item.precioVenta),
      Costo: this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio),
      ITBIS: this.getItbisLabel(item),
      StockActual: this.toNumber(item.stockActual),
      StockMinimo: this.toNumber(item.stockMinimo),
      Estado: item.activo ? 'Activo' : 'Inactivo',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ProductosServicios');
    XLSX.writeFile(workbook, `catalogo-productos-servicios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  applyFilters(): void {
    const q = this.query.trim().toLowerCase();
    this.itemsFiltrados = this.items.filter((item) => {
      const type = this.getTipoFilterValue(item);
      const active = Boolean(item.activo);
      const stockLow = this.isBajoStock(item);
      const matchText = !q || [
        item.nombre,
        item.codigoInterno,
        item.categoriaNombre,
        item.unidadMedidaCodigo,
      ].some((value) => String(value || '').toLowerCase().includes(q));
      const matchTipo = this.filtroTipo === 'todos' || this.filtroTipo === type;
      const categoriaNombre = String(item.categoriaNombre || '').trim();
      const matchCategoria = this.filtroCategoria === 'todas'
        || (this.filtroCategoria === 'sin_categoria' && !categoriaNombre)
        || this.filtroCategoria === categoriaNombre;
      const matchEstado = this.filtroEstado === 'todos'
        || (this.filtroEstado === 'activo' && active)
        || (this.filtroEstado === 'inactivo' && !active);
      const matchStock = this.filtroStock === 'todos'
        || (this.filtroStock === 'bajo' && stockLow)
        || (this.filtroStock === 'normal' && !stockLow);
      return matchText && matchTipo && matchCategoria && matchEstado && matchStock;
    });
    this.page = 1;
  }

  get pagedItems(): ProductoServicio[] {
    const start = (this.page - 1) * this.pageSize;
    return this.itemsFiltrados.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.itemsFiltrados.length / this.pageSize));
  }

  get canGoPrev(): boolean {
    return this.page > 1;
  }

  get canGoNext(): boolean {
    return this.page < this.totalPages;
  }

  prevPage(): void {
    if (!this.canGoPrev) return;
    this.page -= 1;
  }

  nextPage(): void {
    if (!this.canGoNext) return;
    this.page += 1;
  }

  onPageSizeChange(value: string | number): void {
    const parsed = Number(value);
    this.pageSize = this.pageSizeOptions.includes(parsed) ? parsed : 10;
    this.page = 1;
  }

  get kpiTotal(): number {
    return this.itemsFiltrados.length;
  }

  get kpiProductosActivos(): number {
    return this.itemsFiltrados.filter((item) => this.getTipoFilterValue(item) === 'producto' && item.activo).length;
  }

  get kpiServiciosActivos(): number {
    return this.itemsFiltrados.filter((item) => this.getTipoFilterValue(item) === 'servicio' && item.activo).length;
  }

  get kpiStockTotal(): number {
    return this.itemsFiltrados
      .filter((item) => item.manejaInventario)
      .reduce((acc, item) => acc + this.toNumber(item.stockActual), 0);
  }

  get kpiBajoStock(): number {
    return this.itemsFiltrados.filter((item) => this.isBajoStock(item)).length;
  }

  get kpiValorInventario(): number {
    return this.itemsFiltrados
      .filter((item) => item.manejaInventario)
      .reduce((acc, item) => acc + (this.toNumber(item.stockActual) * this.toNumber(item.precioVenta)), 0);
  }

  get kpiCostoInventario(): number {
    return this.itemsFiltrados
      .filter((item) => item.manejaInventario)
      .reduce((acc, item) => acc + (this.toNumber(item.stockActual) * this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio)), 0);
  }

  get kpiMargenPromedio(): number {
    const candidates = this.itemsFiltrados
      .map((item) => {
        const precio = this.toNumber(item.precioVenta);
        const costo = this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio);
        if (precio <= 0 || costo < 0) return null;
        return ((precio - costo) / precio) * 100;
      })
      .filter((value): value is number => value !== null);

    if (candidates.length === 0) return 0;
    return candidates.reduce((acc, value) => acc + value, 0) / candidates.length;
  }

  get kpiConItbis(): number {
    return this.itemsFiltrados.filter((item) => this.toNumber(item.tasaItbis) > 0 && !item.esNoFacturable).length;
  }

  get kpiSinItbis(): number {
    return this.itemsFiltrados.filter((item) => this.toNumber(item.tasaItbis) === 0 || item.esNoFacturable || item.esExento).length;
  }

  getTipoLabel(item: ProductoServicio): string {
    return this.getTipoFilterValue(item) === 'producto' ? 'Producto' : 'Servicio';
  }

  getTipoFilterValue(item: ProductoServicio): 'producto' | 'servicio' {
    return item.tipoItem === 'servicio' ? 'servicio' : 'producto';
  }

  isBajoStock(item: ProductoServicio): boolean {
    if (!item.manejaInventario) return false;
    const stockActual = this.toNumber(item.stockActual);
    const stockMinimo = this.toNumber(item.stockMinimo);
    return stockActual <= stockMinimo;
  }

  getItbisLabel(item: ProductoServicio): string {
    if (item.esNoFacturable) return 'No facturable';
    if (item.esExento) return 'Exento';
    const tasa = this.toNumber(item.tasaItbis);
    return tasa > 0 ? `${tasa}%` : '0%';
  }

  getStockChipColor(item: ProductoServicio): 'success' | 'warning' | 'medium' {
    if (!item.manejaInventario) return 'medium';
    return this.isBajoStock(item) ? 'warning' : 'success';
  }

  formatMoney(value: unknown): string {
    const amount = new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
    return `RD ${amount}`;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
