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
    if (!this.compraId) return;

    try {
      await this.comprasService.confirmarCompra(this.compraId);
      this.compra$ = this.comprasService.getById(this.compraId);
      await this.toastService.success('Compra confirmada correctamente.');
    } catch {
      await this.toastService.error('No fue posible confirmar la compra.');
    }
  }

  volverACompras(): void {
    this.router.navigateByUrl('/admin/inventario/compras');
  }
}
