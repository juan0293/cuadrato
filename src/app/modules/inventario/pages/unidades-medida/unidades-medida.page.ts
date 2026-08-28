import { Component, Input } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { UnidadMedida } from '../../models/unidad-medida.model';
import { UnidadesMedidaService } from '../../services/unidades-medida.service';

@Component({
  selector: 'app-unidades-medida',
  templateUrl: './unidades-medida.page.html',
  styleUrls: ['./unidades-medida.page.scss'],
  standalone: false,
})
export class UnidadesMedidaPage {
  @Input() modalMode = false;
  editingId?: string;
  query = '';

  readonly form = this.fb.nonNullable.group({
    codigo: ['', [Validators.required]],
    nombre: ['', [Validators.required]],
    descripcion: [''],
    activo: [true],
  });

  readonly unidades$: Observable<UnidadMedida[]> = this.service.getUnidades();

  constructor(
    private readonly fb: FormBuilder,
    private readonly service: UnidadesMedidaService,
    private readonly toast: ToastService,
    private readonly modalCtrl: ModalController,
  ) {}

  async closeOrBack(): Promise<void> {
    if (!this.modalMode) return;
    await this.modalCtrl.dismiss({ updated: true });
  }

  filterUnidades(items: UnidadMedida[]): UnidadMedida[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.codigo} ${i.nombre}`.toLowerCase().includes(q));
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.query = String(target?.value || '');
  }

  edit(item: UnidadMedida): void {
    this.editingId = item.id;
    this.form.patchValue({ codigo: item.codigo, nombre: item.nombre, descripcion: item.descripcion || '', activo: item.activo });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();

    const existsCode = await this.service.existsUnidadCodigo(raw.codigo, this.editingId);
    if (existsCode) return void (await this.toast.error('El código de unidad ya existe.'));

    const existsName = await this.service.existsUnidadNombre(raw.nombre, this.editingId);
    if (existsName) return void (await this.toast.error('El nombre de unidad ya existe.'));

    const payload: UnidadMedida = {
      codigo: raw.codigo.trim().toUpperCase(),
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion.trim() || undefined,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };

    if (this.editingId) {
      await this.service.updateUnidad(this.editingId, payload);
      await this.toast.success('Unidad actualizada.');
    } else {
      await this.service.createUnidad(payload);
      await this.toast.success('Unidad creada.');
    }

    this.cancel();
  }

  async toggle(item: UnidadMedida): Promise<void> {
    if (!item.id) return;
    if (item.activo) await this.service.inactivarUnidad(item.id);
    else await this.service.activarUnidad(item.id);
    await this.toast.success(item.activo ? 'Unidad inactivada.' : 'Unidad activada.');
  }

  cancel(): void {
    this.editingId = undefined;
    this.form.reset({ codigo: '', nombre: '', descripcion: '', activo: true });
  }
}
