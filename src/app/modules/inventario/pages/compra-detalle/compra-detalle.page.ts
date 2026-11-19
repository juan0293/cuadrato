import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { Compra } from '../../models/compra.model';
import { ComprasService } from '../../services/compras.service';

@Component({
  selector: 'app-compra-detalle',
  templateUrl: './compra-detalle.page.html',
  styleUrls: ['./compra-detalle.page.scss'],
  standalone: false,
})
export class CompraDetallePage implements OnInit {
  compra$?: Observable<Compra>;
  compraId = '';
  confirming = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly comprasService: ComprasService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.compraId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.compraId) {
      this.router.navigateByUrl('/admin/inventario/compras');
      return;
    }

    this.compra$ = this.comprasService.getById(this.compraId);
  }

  async confirmar(): Promise<void> {
    if (!this.compraId || this.confirming) return;

    this.confirming = true;
    try {
      await this.comprasService.confirmarCompra(this.compraId);
      this.compra$ = this.comprasService.getById(this.compraId);
      await this.toastService.success('Compra confirmada correctamente.');
    } catch {
      await this.toastService.error('No fue posible confirmar la compra.');
    } finally {
      this.confirming = false;
    }
  }

  formatMoney(value: number | null | undefined, currency: Compra['moneda'] = 'DOP'): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: currency || 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  formatDate(value: unknown): string {
    if (!value) return 'No registrada';

    const source = value as { toDate?: () => Date; seconds?: number };
    const date = typeof source.toDate === 'function'
      ? source.toDate()
      : typeof source.seconds === 'number'
        ? new Date(source.seconds * 1000)
        : new Date(String(value));

    return Number.isNaN(date.getTime())
      ? 'No registrada'
      : date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  volverACompras(): void {
    this.router.navigateByUrl('/admin/inventario/compras');
  }
}
