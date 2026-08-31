import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import { ProductoServicio } from '../models/producto-servicio.model';
import { ProductosServiciosService } from '../services/productos-servicios.service';
import { InventarioThemeService } from '../services/inventario-theme.service';

interface InventarioQuickAction {
  label: string;
  description: string;
  route: string;
  icon: string;
}

interface InventarioAlert {
  title: string;
  detail: string;
  type: 'warning' | 'info' | 'success';
}

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

@Component({
  standalone: false,
  selector: 'app-inventario',
  templateUrl: './inventario.page.html',
  styleUrls: ['./inventario.page.scss'],
})
export class InventarioPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('tipoChartCanvas') tipoChartCanvas?: ElementRef<HTMLCanvasElement>;

  items: ProductoServicio[] = [];
  loading = true;
  loadError = false;
  alerts: InventarioAlert[] = [];

  readonly quickActions: InventarioQuickAction[] = [
    { label: 'Nueva compra', description: 'Registrar nueva compra', route: '/admin/inventario/compras/nuevo', icon: 'receipt-outline' },
    { label: 'Ver productos y servicios', description: 'Catálogo comercial y fiscal', route: '/admin/inventario/productos-servicios', icon: 'cube-outline' },
    { label: 'Registrar producto/servicio', description: 'Alta rápida de catálogo', route: '/admin/inventario/productos-servicios/nuevo', icon: 'add-circle-outline' },
    // { label: 'Exportar inventario', description: 'Consolidado en Excel', route: '/admin/inventario/productos-servicios', icon: 'download-outline' },
    { label: 'Movimientos de inventario', description: 'Entradas, salidas y ajustes', route: '/admin/inventario/movimientos-inventario', icon: 'swap-vertical-outline' },
  ];

  private sub?: Subscription;
  private tipoChart?: Chart;
  private viewReady = false;

  constructor(
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly router: Router,
    private readonly themeService: InventarioThemeService,
  ) {}

  ngOnInit(): void {
    this.themeService.initialize();
    this.sub = this.productosServiciosService.getProductosServicios().subscribe({
      next: (items) => {
        this.items = items || [];
        this.loading = false;
        this.loadError = false;
        this.buildAlerts();
        this.refreshChartsIfReady();
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.refreshChartsIfReady();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.tipoChart?.destroy();
  }

  get totalProductosServicios(): number {
    return this.items.length;
  }

  get productosActivos(): number {
    return this.items.filter((item) => this.isProducto(item) && item.activo).length;
  }

  get serviciosActivos(): number {
    return this.items.filter((item) => this.isServicio(item) && item.activo).length;
  }

  get productosBajoStock(): number {
    return this.items.filter((item) => this.isBajoStock(item)).length;
  }

  get valorInventarioEstimado(): number {
    return this.items
      .filter((item) => item.manejaInventario)
      .reduce((acc, item) => acc + (this.toNumber(item.stockActual) * this.toNumber(item.precioVenta)), 0);
  }

  get costoTotalInventario(): number {
    return this.items
      .filter((item) => item.manejaInventario)
      .reduce((acc, item) => acc + (this.toNumber(item.stockActual) * this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio)), 0);
  }

  get margenPromedioEstimado(): number {
    const margins = this.items
      .map((item) => {
        const precio = this.toNumber(item.precioVenta);
        const costo = this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio);
        if (precio <= 0) return null;
        return ((precio - costo) / precio) * 100;
      })
      .filter((value): value is number => value !== null);

    if (!margins.length) return 0;
    return margins.reduce((acc, value) => acc + value, 0) / margins.length;
  }

  get productosConItbis(): number {
    return this.items.filter((item) => this.toNumber(item.tasaItbis) > 0 && !item.esNoFacturable).length;
  }

  get chartProductosCount(): number {
    return this.items.filter((item) => this.isProducto(item)).length;
  }

  get chartServiciosCount(): number {
    return this.items.filter((item) => this.isServicio(item)).length;
  }

  get hasAlerts(): boolean {
    return this.alerts.length > 0;
  }

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }

  get inventoryTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  toggleInventoryTheme(): void {
    this.themeService.toggle();
    this.refreshChartsIfReady();
  }

  formatMoney(value: unknown): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toNumber(value));
  }

  private refreshChartsIfReady(): void {
    if (!this.viewReady || !this.tipoChartCanvas) return;
    this.renderTipoChart();
  }

  private renderTipoChart(): void {
    const canvas = this.tipoChartCanvas?.nativeElement;
    if (!canvas) return;
    this.tipoChart?.destroy();

    const isDark = this.inventoryTheme === 'dark';
    this.tipoChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Productos', 'Servicios'],
        datasets: [
          {
            data: [this.chartProductosCount, this.chartServiciosCount],
            backgroundColor: ['#3B82F6', '#38BDF8'],
            borderColor: isDark ? ['#334155', '#334155'] : ['#ffffff', '#ffffff'],
            borderWidth: 1.4,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: isDark ? '#E5EDFF' : '#344054',
              boxWidth: 14,
            },
          },
        },
      },
    });
  }

  private buildAlerts(): void {
    const underStock = this.items.filter((item) => this.isBajoStock(item)).length;
    const noCost = this.items.filter((item) => this.isProducto(item) && this.toNumber(item.precioCompra ?? item.ultimoCosto ?? item.costoPromedio) <= 0).length;
    const noSalePrice = this.items.filter((item) => this.toNumber(item.precioVenta) <= 0).length;
    const inactive = this.items.filter((item) => !item.activo).length;

    const alerts: InventarioAlert[] = [];
    if (underStock > 0) alerts.push({ title: 'Productos bajo stock', detail: `${underStock} registro(s) por debajo del mínimo.`, type: 'warning' });
    if (noCost > 0) alerts.push({ title: 'Productos sin costo', detail: `${noCost} producto(s) sin costo configurado.`, type: 'info' });
    if (noSalePrice > 0) alerts.push({ title: 'Productos sin precio de venta', detail: `${noSalePrice} registro(s) con precio en cero.`, type: 'info' });
    if (inactive > 0) alerts.push({ title: 'Productos inactivos', detail: `${inactive} registro(s) inactivos en catálogo.`, type: 'info' });

    this.alerts = alerts;
  }

  private isProducto(item: ProductoServicio): boolean {
    return item.tipoItem !== 'servicio';
  }

  private isServicio(item: ProductoServicio): boolean {
    return item.tipoItem === 'servicio';
  }

  private isBajoStock(item: ProductoServicio): boolean {
    if (!item.manejaInventario) return false;
    return this.toNumber(item.stockActual) <= this.toNumber(item.stockMinimo);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
