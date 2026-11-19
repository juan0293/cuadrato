import { Component, Input } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { ToastService } from '../../../../core/services/toast.service';
import { Proveedor } from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';

@Component({
  selector: 'app-proveedores',
  templateUrl: './proveedores.page.html',
  styleUrls: ['./proveedores.page.scss'],
  standalone: false,
})
export class ProveedoresPage {
  @Input() modalMode = false;
  editingId?: string;
  query = '';

  readonly proveedores$: Observable<Proveedor[]> = this.proveedoresService.getProveedores();

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    tipoIdentificacion: ['rnc' as 'rnc' | 'cedula' | 'pasaporte' | 'otro'],
    rnc: [''],
    telefono: [''],
    email: [''],
    direccion: [''],
    condicionesPagoDefault: ['contado' as 'contado' | 'credito'],
    diasCreditoDefault: [0],
    monedaDefault: ['DOP' as 'DOP' | 'USD' | 'EUR' | 'CAD' | 'GBP'],
    activo: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly proveedoresService: ProveedoresService,
    private readonly toastService: ToastService,
    private readonly modalCtrl: ModalController,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  async closeOrBack(): Promise<void> {
    if (this.modalMode) {
      await this.modalCtrl.dismiss({ updated: true });
      return;
    }

    const returnTo = this.route.snapshot.queryParamMap.get('returnTo') || '/admin/inventario/compras/nuevo';
    await this.router.navigateByUrl(returnTo);
  }

  filtered(items: Proveedor[]): Proveedor[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.nombre, item.rnc, item.telefono, item.email].some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.query = String(target?.value || '');
  }

  trackByProveedor(_: number, item: Proveedor): string {
    return item.id || item.nombre;
  }

  edit(item: Proveedor): void {
    this.editingId = item.id;
    this.form.patchValue({
      nombre: item.nombre,
      tipoIdentificacion: item.tipoIdentificacion || 'rnc',
      rnc: item.rnc || '',
      telefono: item.telefono || '',
      email: item.email || '',
      direccion: item.direccion || '',
      condicionesPagoDefault: item.condicionesPagoDefault || 'contado',
      diasCreditoDefault: item.diasCreditoDefault || 0,
      monedaDefault: item.monedaDefault || 'DOP',
      activo: item.activo,
    });

    requestAnimationFrame(() => {
      document.getElementById('provider-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();

    if (await this.proveedoresService.existsProveedorNombre(raw.nombre, this.editingId)) {
      await this.toastService.error('Ya existe un proveedor con ese nombre.');
      return;
    }

    if (raw.rnc && (await this.proveedoresService.existsProveedorRnc(raw.rnc, this.editingId))) {
      await this.toastService.error('Ya existe un proveedor con ese RNC.');
      return;
    }

    const payload: Proveedor = {
      nombre: raw.nombre.trim(),
      tipoIdentificacion: raw.tipoIdentificacion,
      rnc: raw.rnc.trim() || undefined,
      telefono: raw.telefono.trim() || undefined,
      email: raw.email.trim() || undefined,
      direccion: raw.direccion.trim() || undefined,
      condicionesPagoDefault: raw.condicionesPagoDefault,
      diasCreditoDefault: Number(raw.diasCreditoDefault || 0),
      monedaDefault: raw.monedaDefault,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };

    if (this.editingId) {
      await this.proveedoresService.updateProveedor(this.editingId, payload);
      await this.toastService.success('Proveedor actualizado.');
    } else {
      await this.proveedoresService.createProveedor(payload);
      await this.toastService.success('Proveedor creado.');
    }

    this.cancel();
  }

  async toggle(item: Proveedor): Promise<void> {
    if (!item.id) return;
    if (item.activo) await this.proveedoresService.inactivarProveedor(item.id);
    else await this.proveedoresService.activarProveedor(item.id);
    await this.toastService.success(item.activo ? 'Proveedor inactivado.' : 'Proveedor activado.');
  }

  cancel(): void {
    this.editingId = undefined;
    this.form.reset({
      nombre: '',
      tipoIdentificacion: 'rnc',
      rnc: '',
      telefono: '',
      email: '',
      direccion: '',
      condicionesPagoDefault: 'contado',
      diasCreditoDefault: 0,
      monedaDefault: 'DOP',
      activo: true,
    });
  }
}
