import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { categoriasInsumo, normalizarCategoriaInsumo } from '../helpers/inventario.helper';
import { Insumo } from '../models/insumo.model';
import { InventarioService } from '../services/inventario.service';

@Component({
  standalone: false,
  selector: 'app-insumo-form',
  templateUrl: './insumo-form.page.html',
  styleUrls: ['./insumo-form.page.scss'],
})
export class InsumoFormPage implements OnInit {
  readonly categorias = categoriasInsumo;
  insumoId: string | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    categoria: ['otros', Validators.required],
    unidadMedida: ['unidad', Validators.required],
    stockActual: [0, [Validators.required, Validators.min(0)]],
    stockMinimo: [1, [Validators.required, Validators.min(0)]],
    costoUnitario: [0],
    activo: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly inventarioService: InventarioService,
    private readonly toastService: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.insumoId = this.route.snapshot.paramMap.get('id');
    if (!this.insumoId) return;

    const insumo = await firstValueFrom(this.inventarioService.getById(this.insumoId));
    this.form.patchValue({
      nombre: insumo.nombre,
      categoria: insumo.categoria,
      unidadMedida: insumo.unidadMedida,
      stockActual: insumo.stockActual,
      stockMinimo: insumo.stockMinimo,
      costoUnitario: insumo.costoUnitario ?? 0,
      activo: insumo.activo,
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa los campos de insumo.');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: Insumo = {
      nombre: raw.nombre.trim(),
      categoria: normalizarCategoriaInsumo(raw.categoria),
      unidadMedida: raw.unidadMedida.trim(),
      stockActual: Number(raw.stockActual),
      stockMinimo: Number(raw.stockMinimo),
      costoUnitario: Number(raw.costoUnitario) || undefined,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
    };

    if (this.insumoId) {
      await this.inventarioService.update(this.insumoId, payload);
      await this.toastService.success('Insumo actualizado.');
    } else {
      await this.inventarioService.create(payload);
      await this.toastService.success('Insumo creado.');
    }

    await this.router.navigateByUrl('/admin/inventario');
  }
}
