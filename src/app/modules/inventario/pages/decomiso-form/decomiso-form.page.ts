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
  selector: 'app-decomiso-form',
  templateUrl: './decomiso-form.page.html',
  styleUrls: ['./decomiso-form.page.scss'],
  standalone: false,
})
export class DecomisoFormPage {
  readonly items$ = this.productosServiciosService.list();
  readonly tipos: TipoMovimientoInventario[] = ['decomiso', 'averia', 'vencimiento', 'uso_interno', 'robo', 'perdida', 'merma', 'ajuste_fisico'];

  readonly form = this.fb.nonNullable.group({
    productoId: ['', Validators.required],
    tipoMovimiento: ['decomiso' as TipoMovimientoInventario, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    motivo: ['', [Validators.required, Validators.minLength(5)]],
    evidenciaUrl: [''],
    referenciaTipo: ['decomiso_ajuste'],
    referenciaId: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly productosServiciosService: ProductosServiciosService,
    private readonly movimientosService: MovimientosInventarioService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {}

  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa los datos del decomiso/ajuste.');
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
      evidenciaUrl: raw.evidenciaUrl?.trim() || undefined,
      referenciaTipo: raw.referenciaTipo || 'decomiso_ajuste',
      referenciaId: raw.referenciaId || undefined,
      fecha: new Date().toISOString(),
      creadoPor: user?.uid ?? 'sistema',
    };

    try {
      await this.movimientosService.registrarMovimientoFiscal(payload);
      await this.toastService.success('Decomiso/ajuste registrado.');
      await this.router.navigateByUrl('/admin/inventario/decomisos');
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'NEGATIVE_STOCK') {
        await this.toastService.error('Stock insuficiente para este ajuste.');
        return;
      }
      await this.toastService.error('No fue posible registrar el decomiso/ajuste.');
    }
  }

  labelForItem(item: ProductoServicio): string {
    return `${item.nombre} (${item.codigoInterno})`;
  }
}
