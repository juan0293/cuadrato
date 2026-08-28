import { Component, Input } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { Utilidad } from '../../models/utilidad.model';
import { UtilidadesService } from '../../services/utilidades.service';

@Component({
  selector: 'app-utilidades',
  templateUrl: './utilidades.page.html',
  styleUrls: ['./utilidades.page.scss'],
  standalone: false,
})
export class UtilidadesPage {
  @Input() modalMode = false;
  editingId?: string;
  query = '';

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required]],
    porcentaje: [0, [Validators.required, Validators.min(0)]],
    descripcion: [''],
    activo: [true],
  });

  readonly utilidades$: Observable<Utilidad[]> = this.service.getUtilidades();

  constructor(
    private readonly fb: FormBuilder,
    private readonly service: UtilidadesService,
    private readonly toast: ToastService,
    private readonly modalCtrl: ModalController,
  ) {}

  async closeOrBack(): Promise<void> {
    if (!this.modalMode) return;
    await this.modalCtrl.dismiss({ updated: true });
  }

  filterUtilidades(items: Utilidad[]): Utilidad[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.nombre} ${i.porcentaje}`.toLowerCase().includes(q));
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.query = String(target?.value || '');
  }

  edit(item: Utilidad): void {
    this.editingId = item.id;
    this.form.patchValue({ nombre: item.nombre, porcentaje: item.porcentaje, descripcion: item.descripcion || '', activo: item.activo });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();

    if (raw.porcentaje < 0) return void (await this.toast.error('La utilidad seleccionada no es válida.'));

    const existsName = await this.service.existsUtilidadNombre(raw.nombre, this.editingId);
    if (existsName) return void (await this.toast.error('Ya existe una utilidad con ese nombre.'));

    const payload: Utilidad = {
      nombre: raw.nombre.trim(),
      porcentaje: Number(raw.porcentaje || 0),
      descripcion: raw.descripcion.trim() || undefined,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };

    if (this.editingId) {
      await this.service.updateUtilidad(this.editingId, payload);
      await this.toast.success('Utilidad actualizada.');
    } else {
      await this.service.createUtilidad(payload);
      await this.toast.success('Utilidad creada.');
    }

    this.cancel();
  }

  async toggle(item: Utilidad): Promise<void> {
    if (!item.id) return;
    if (item.activo) await this.service.inactivarUtilidad(item.id);
    else await this.service.activarUtilidad(item.id);
    await this.toast.success(item.activo ? 'Utilidad inactivada.' : 'Utilidad activada.');
  }

  cancel(): void {
    this.editingId = undefined;
    this.form.reset({ nombre: '', porcentaje: 0, descripcion: '', activo: true });
  }
}
