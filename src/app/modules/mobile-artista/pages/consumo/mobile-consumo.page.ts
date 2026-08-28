import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Cita } from '../../../agenda/models/cita.model';
import { Insumo } from '../../../inventario/models/insumo.model';
import { MovimientoInventario } from '../../../inventario/models/movimiento-inventario.model';
import { MovimientosInventarioService } from '../../../inventario/services/movimientos-inventario.service';
import { MobileArtistaService } from '../../services/mobile-artista.service';

@Component({
  selector: 'app-mobile-consumo',
  templateUrl: './mobile-consumo.page.html',
  styleUrls: ['./mobile-consumo.page.scss'],
  standalone: false,
})
export class MobileConsumoPage {
  readonly citas$: Observable<Cita[]> = this.mobileArtistaService.proximasCitas$();
  readonly insumos$: Observable<Insumo[]> = this.mobileArtistaService.insumosActivos$();

  readonly form = this.fb.nonNullable.group({
    insumoId: ['', Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    citaId: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly mobileArtistaService: MobileArtistaService,
    private readonly movimientosInventarioService: MovimientosInventarioService,
    private readonly toastService: ToastService,
  ) {}

  async registrarConsumo(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa insumo y cantidad.');
      return;
    }

    const user = await firstValueFrom(this.authService.user$);
    if (!user?.uid) return;

    const raw = this.form.getRawValue();
    const insumos = await firstValueFrom(this.insumos$);
    const insumo = insumos.find((item) => item.id === raw.insumoId);
    if (!insumo?.id) {
      await this.toastService.error('Insumo inválido.');
      return;
    }

    const payload: MovimientoInventario = {
      insumoId: insumo.id,
      insumoNombre: insumo.nombre,
      tipo: 'salida',
      cantidad: Number(raw.cantidad),
      motivo: 'consumo artista móvil',
      artistaId: user.uid,
      citaId: raw.citaId || undefined,
      fecha: new Date().toISOString(),
      creadoPor: user.uid,
    };

    try {
      await this.movimientosInventarioService.registrarMovimiento(payload);
      await this.toastService.success('Consumo registrado.');
      this.form.patchValue({ cantidad: 1, citaId: '' });
    } catch (error) {
      if ((error as Error).message === 'NEGATIVE_STOCK') {
        await this.toastService.error('Stock insuficiente.');
        return;
      }
      await this.toastService.error('No se pudo registrar el consumo.');
    }
  }
}
