import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { CuentaPorPagar } from '../../models/cuenta-por-pagar.model';
import { CuentasPorPagarService } from '../../services/cuentas-por-pagar.service';

@Component({
  selector: 'app-cuenta-por-pagar-detalle',
  templateUrl: './cuenta-por-pagar-detalle.page.html',
  styleUrls: ['./cuenta-por-pagar-detalle.page.scss'],
  standalone: false,
})
export class CuentaPorPagarDetallePage implements OnInit {
  cuenta$?: Observable<CuentaPorPagar>;
  cuentaId = '';

  readonly form = this.fb.nonNullable.group({
    montoAbono: [0, [Validators.required, Validators.min(0.01)]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cuentasService: CuentasPorPagarService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.cuentaId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.cuentaId) {
      this.router.navigateByUrl('/admin/inventario/cuentas-por-pagar');
      return;
    }

    this.cuenta$ = this.cuentasService.getById(this.cuentaId);
  }

  goBack(): void {
    this.router.navigateByUrl('/admin/inventario/cuentas-por-pagar');
  }

  async registrarAbono(): Promise<void> {
    if (!this.cuentaId || this.form.invalid) {
      await this.toastService.error('Ingresa un monto válido.');
      return;
    }

    try {
      await this.cuentasService.registrarAbono(this.cuentaId, Number(this.form.controls.montoAbono.value));
      this.form.patchValue({ montoAbono: 0 });
      this.cuenta$ = this.cuentasService.getById(this.cuentaId);
      await this.toastService.success('Abono registrado correctamente.');
    } catch {
      await this.toastService.error('No fue posible registrar el abono.');
    }
  }
}
