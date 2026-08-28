import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { ToastService } from '../../../../core/services/toast.service';
import { Compra } from '../../models/compra.model';
import { Proveedor } from '../../models/proveedor.model';
import { ComprasService } from '../../services/compras.service';
import { PdfCompraService } from '../../services/pdf-compra.service';
import { ProveedoresService } from '../../services/proveedores.service';
import { buildComprasExcelRows } from '../../utils/compras-export.utils';

@Component({
  selector: 'app-compras',
  templateUrl: './compras.page.html',
  styleUrls: ['./compras.page.scss'],
  standalone: false,
})
export class ComprasPage implements OnInit, OnDestroy {
  compras: Compra[] = [];
  comprasFiltradas: Compra[] = [];
  loading = true;

  query = '';
  filtroEstado = 'todos';
  filtroCondicion = 'todas';
  filtroFechaDesde = '';
  filtroFechaHasta = '';
  filtroProveedorId = '';
  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];

  proveedores: Proveedor[] = [];

  private sub?: Subscription;
  private proveedoresSub?: Subscription;

  constructor(
    private readonly comprasService: ComprasService,
    private readonly proveedoresService: ProveedoresService,
    private readonly pdfCompraService: PdfCompraService,
    private readonly toastService: ToastService,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly alertCtrl: AlertController,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.setDefaultMonthDateRange();

    this.proveedoresSub = this.proveedoresService.getProveedores().subscribe({
      next: (items) => {
        this.proveedores = [...items].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      },
    });

    this.sub = this.comprasService.list().subscribe({
      next: (items) => {
        this.compras = [...items].sort((a, b) => String(b.fechaCreacion).localeCompare(String(a.fechaCreacion)));
        this.applyFilters();
        this.loading = false;
      },
      error: async () => {
        this.loading = false;
        await this.toastService.error('No fue posible cargar las compras.');
      },
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.proveedoresSub?.unsubscribe();
  }

  get kpiComprasMes(): number {
    const now = new Date();
    return this.compras.filter((c) => {
      const date = new Date(String(c.fechaEmision || c.fechaCreacion));
      return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
  }

  get kpiTotalComprado(): number {
    return this.comprasFiltradas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  }

  get kpiItbis(): number {
    return this.comprasFiltradas.reduce((acc, item) => acc + Number(item.totalItbis || 0), 0);
  }

  get kpiCxp(): number {
    return this.comprasFiltradas
      .filter((item) => item.condicionPago === 'credito' && item.estado !== 'anulada')
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }

  goToNew(): void {
    this.router.navigateByUrl('/admin/inventario/compras/nuevo');
  }

  goToInventario(): void {
    this.router.navigateByUrl('/admin');
  }

  goToDetail(id?: string): void {
    if (!id) return;
    this.router.navigate(['/admin/inventario/compras', id]);
  }

  onSearch(value: string | null | undefined): void {
    this.query = String(value || '');
    this.applyFilters();
  }

  onEstadoChange(value: string): void {
    this.filtroEstado = value;
    this.applyFilters();
  }

  onCondicionChange(value: string): void {
    this.filtroCondicion = value;
    this.applyFilters();
  }

  onFechaDesdeChange(value: string | null | undefined): void {
    this.filtroFechaDesde = String(value || '');
    this.applyFilters();
  }

  onFechaHastaChange(value: string | null | undefined): void {
    this.filtroFechaHasta = String(value || '');
    this.applyFilters();
  }

  onProveedorFilterSelected(proveedor: Proveedor): void {
    this.filtroProveedorId = String(proveedor.id || '');
    this.applyFilters();
  }

  clearProveedorFilter(): void {
    this.filtroProveedorId = '';
    this.applyFilters();
  }

  verAnuladas(): void {
    this.filtroEstado = 'anulada';
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.query.trim().toLowerCase();

    this.comprasFiltradas = this.compras.filter((compra) => {
      const matchText = !q || [
        compra.proveedorNombre,
        compra.proveedorRnc,
        compra.ncf,
        compra.numeroFactura,
        compra.estado,
        compra.condicionPago,
      ].some((v) => String(v || '').toLowerCase().includes(q));

      const matchEstado = this.filtroEstado === 'todos' || compra.estado === this.filtroEstado;
      const matchCondicion = this.filtroCondicion === 'todas' || compra.condicionPago === this.filtroCondicion;
      const matchProveedor = !this.filtroProveedorId || compra.proveedorId === this.filtroProveedorId;

      const compraDate = new Date(String(compra.fechaEmision || compra.fechaCreacion));
      const hasValidCompraDate = !Number.isNaN(compraDate.getTime());
      const start = this.filtroFechaDesde ? new Date(`${this.filtroFechaDesde}T00:00:00`) : null;
      const end = this.filtroFechaHasta ? new Date(`${this.filtroFechaHasta}T23:59:59`) : null;
      const matchFechaDesde = !start || (hasValidCompraDate && compraDate >= start);
      const matchFechaHasta = !end || (hasValidCompraDate && compraDate <= end);

      return matchText && matchEstado && matchCondicion && matchProveedor && matchFechaDesde && matchFechaHasta;
    });
    this.page = 1;
  }

  get pagedCompras(): Compra[] {
    const start = (this.page - 1) * this.pageSize;
    return this.comprasFiltradas.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.comprasFiltradas.length / this.pageSize));
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

  /**
   * Configura el rango inicial para mostrar compras del mes actual desde el primer día
   * hasta el último día en formato YYYY-MM-DD, compatible con ion-input type="date".
   */
  private setDefaultMonthDateRange(): void {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    this.filtroFechaDesde = this.toDateInputValue(firstDay);
    this.filtroFechaHasta = this.toDateInputValue(lastDay);
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async onConfirm(compra: Compra): Promise<void> {
    if (!compra.id || compra.estado !== 'borrador') return;

    try {
      await this.comprasService.confirmarCompra(compra.id);
      const updated = this.compras.find((item) => item.id === compra.id);
      if (updated) {
        updated.estado = 'confirmada';
        updated.inventarioAfectado = true;
      }
      this.applyFilters();
      await this.toastService.success('Compra confirmada e inventario actualizado.');
      const refreshed = this.compras.find((item) => item.id === compra.id) || compra;
      await this.presentPdfOptions(refreshed);
    } catch {
      await this.toastService.error('No fue posible confirmar la compra.');
    }
  }

  async onVoid(compra: Compra): Promise<void> {
    if (!compra.id || compra.estado !== 'confirmada') return;

    const alert = await this.alertCtrl.create({
      header: 'Anular compra',
      message: `La compra ${compra.numeroFactura || compra.id} se marcará como anulada y se reversará el inventario relacionado.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async () => {
            try {
              await this.comprasService.anularCompra(compra.id as string);
              const local = this.compras.find((item) => item.id === compra.id);
              if (local) {
                local.estado = 'anulada';
                local.inventarioReversado = true;
              }
              this.applyFilters();
              await this.toastService.success('Compra anulada e inventario reversado.');
            } catch (error) {
              const message = String((error as Error)?.message || '');
              if (message.startsWith('INSUFFICIENT_STOCK_TO_REVERSE:')) {
                const productName = message.split(':')[1] || 'producto';
                await this.toastService.error(`No hay stock suficiente para reversar ${productName}.`);
                return;
              }
              if (message === 'COMPRA_ALREADY_VOIDED') {
                await this.toastService.error('La compra ya está anulada.');
                return;
              }
              if (message === 'ONLY_CONFIRMED_COMPRA_CAN_BE_VOIDED') {
                await this.toastService.error('Solo se pueden anular compras confirmadas.');
                return;
              }
              await this.toastService.error('No fue posible anular la compra.');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async presentPdfOptions(compra: Compra): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Comprobante de compra',
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
          text: 'Ver preview e-CF',
          icon: 'eye-outline',
          handler: () => this.router.navigate(['/admin/inventario/ecf-preview', compra.id]),
        },
        {
          text: 'Abrir PDF',
          icon: 'document-text-outline',
          handler: () => this.pdfCompraService.abrirPreviewCompra(compra),
        },
        { text: 'Finalizar sin imprimir', role: 'cancel', icon: 'close-outline' },
      ],
    });

    await sheet.present();
  }

  async openActions(compra: Compra): Promise<void> {
    const buttons: any[] = [
      { text: 'Ver detalle', icon: 'eye-outline', handler: () => this.goToDetail(compra.id) },
      { text: 'Imprimir', icon: 'print-outline', handler: () => this.pdfCompraService.imprimirCompra(compra) },
      { text: 'Guardar PDF', icon: 'download-outline', handler: () => this.pdfCompraService.guardarPdfCompra(compra) },
      { text: 'Preview e-CF', icon: 'reader-outline', handler: () => this.router.navigate(['/admin/inventario/ecf-preview', compra.id]) },
    ];

    if (compra.estado === 'confirmada') {
      buttons.push({ text: 'Anular compra', icon: 'ban-outline', role: 'destructive', handler: () => this.onVoid(compra) });
    }

    if (compra.estado === 'borrador') {
      buttons.push({ text: 'Confirmar compra', icon: 'checkmark-done-outline', handler: () => this.onConfirm(compra) });
    }

    buttons.push({ text: 'Cerrar', role: 'cancel', icon: 'close-outline' });

    const sheet = await this.actionSheetCtrl.create({ header: 'Acciones de compra', buttons });
    await sheet.present();
  }

  printCompra(compra: Compra): void {
    this.pdfCompraService.imprimirCompra(compra);
  }

  saveCompraPdf(compra: Compra): void {
    this.pdfCompraService.guardarPdfCompra(compra);
  }

  openCompraPreview(compra: Compra): void {
    this.router.navigate(['/admin/inventario/ecf-preview', compra.id]);
  }

  exportarExcelCompras(): void {
    const rows = buildComprasExcelRows(this.comprasFiltradas);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Compras');

    const fileName = `consolidado-compras-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  formatDate(value: unknown, withTime = false): string {
    const date = new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return '-';
    return withTime ? date.toLocaleString('es-DO') : date.toLocaleDateString('es-DO');
  }
}
