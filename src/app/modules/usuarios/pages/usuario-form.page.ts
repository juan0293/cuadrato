import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UsuariosService } from '../services/usuarios.service';
import { normalizeEmail, phoneValidator } from '../utils/usuarios.utils';
import { UsuarioModel } from '../models/usuario.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  standalone: false,
  selector: 'app-usuario-form',
  templateUrl: './usuario-form.page.html',
  styleUrls: ['./usuario-form.page.scss'],
})
export class UsuarioFormPage implements OnInit {
  userId: string | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    rol: ['artista' as UsuarioModel['rol'], [Validators.required]],
    telefono: ['', [phoneValidator]],
    activo: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly usuariosService: UsuariosService,
    private readonly toastService: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.userId = this.route.snapshot.paramMap.get('id');
    if (!this.userId) return;

    const user = await firstValueFrom(this.usuariosService.getById(this.userId));
    this.form.patchValue({
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      telefono: user.telefono ?? '',
      activo: user.activo,
    });
  }

  /**
   * Persiste el perfil interno del usuario. En Fase 2 se prioriza
   * el control operativo/roles, no la creación automatizada de credenciales Auth.
   */
  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Formulario inválido.');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: UsuarioModel = {
      nombre: raw.nombre.trim(),
      email: normalizeEmail(raw.email),
      rol: raw.rol,
      telefono: raw.telefono?.trim() || undefined,
      activo: raw.activo,
      fechaCreacion: new Date().toISOString(),
    };

    if (this.userId) {
      await this.usuariosService.update(this.userId, payload);
      await this.toastService.success('Usuario actualizado.');
    } else {
      await this.usuariosService.create(payload);
      await this.toastService.success('Usuario creado.');
    }

    await this.router.navigateByUrl('/admin/usuarios');
  }
}
