import { Component, Input } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { CategoriaProducto } from '../../models/categoria-producto.model';
import { CategoriasProductosService } from '../../services/categorias-productos.service';

@Component({
  selector: 'app-categorias-productos',
  templateUrl: './categorias-productos.page.html',
  styleUrls: ['./categorias-productos.page.scss'],
  standalone: false,
})
export class CategoriasProductosPage {
  @Input() modalMode = false;
  editingId?: string;
  query = '';

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required]],
    descripcion: [''],
    activo: [true],
  });

  readonly categorias$: Observable<CategoriaProducto[]> = this.service.getCategorias();

  constructor(
    private readonly fb: FormBuilder,
    private readonly service: CategoriasProductosService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly modalCtrl: ModalController,
  ) {}

  async closeOrBack(): Promise<void> {
    if (this.modalMode) {
      await this.modalCtrl.dismiss({ updated: true });
      return;
    }
    this.router.navigateByUrl('/admin/inventario/productos-servicios');
  }

  filterCategorias(items: CategoriaProducto[]): CategoriaProducto[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.nombre.toLowerCase().includes(q));
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.query = String(target?.value || '');
  }

  edit(item: CategoriaProducto): void {
    this.editingId = item.id;
    this.form.patchValue({ nombre: item.nombre, descripcion: item.descripcion || '', activo: item.activo });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const exists = await this.service.existsCategoriaNombre(raw.nombre, this.editingId);
    if (exists) {
      await this.toast.error('Ya existe una categoría con ese nombre.');
      return;
    }

    const payload: CategoriaProducto = {
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion.trim() || undefined,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };

    if (this.editingId) {
      await this.service.updateCategoria(this.editingId, payload);
      await this.toast.success('Categoría actualizada.');
    } else {
      await this.service.createCategoria(payload);
      await this.toast.success('Categoría creada.');
    }

    this.cancel();
  }

  async toggle(item: CategoriaProducto): Promise<void> {
    if (!item.id) return;
    if (item.activo) await this.service.inactivarCategoria(item.id);
    else await this.service.activarCategoria(item.id);
    await this.toast.success(item.activo ? 'Categoría inactivada.' : 'Categoría activada.');
  }

  cancel(): void {
    this.editingId = undefined;
    this.form.reset({ nombre: '', descripcion: '', activo: true });
  }
}
