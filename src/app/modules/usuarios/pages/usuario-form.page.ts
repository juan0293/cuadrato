import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UsuariosService } from '../services/usuarios.service';
import { normalizeEmail, phoneValidator } from '../utils/usuarios.utils';
import { UsuarioModel } from '../models/usuario.model';
import { ToastService } from '../../../core/services/toast.service';
import { UsuariosThemeService } from '../services/usuarios-theme.service';

@Component({
  standalone: false,
  selector: 'app-usuario-form',
  templateUrl: './usuario-form.page.html',
  styleUrls: ['./usuario-form.page.scss'],
})
export class UsuarioFormPage implements OnInit {
  userId: string | null = null;
  saving = false;
  private existingUser: UsuarioModel | null = null;

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
    private readonly themeService: UsuariosThemeService,
  ) {}

  get usersTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  toggleUsersTheme(): void {
    this.themeService.toggle();
  }

  async ngOnInit(): Promise<void> {
    this.userId = this.route.snapshot.paramMap.get('id');
    if (!this.userId) return;

    const user = await firstValueFrom(this.usuariosService.getById(this.userId));
    this.existingUser = user;
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
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await this.toastService.error('Completa correctamente los campos obligatorios.');
      return;
    }

    const raw = this.form.getRawValue();
    const telefono = raw.telefono.trim();
    const payload: UsuarioModel = {
      nombre: raw.nombre.trim(),
      email: normalizeEmail(raw.email),
      rol: raw.rol,
      ...(telefono ? { telefono } : {}),
      activo: raw.activo,
      fechaCreacion: this.existingUser?.fechaCreacion || new Date().toISOString(),
    };

    this.saving = true;
    try {
      if (this.userId) {
        await this.usuariosService.update(this.userId, payload);
        await this.toastService.success('Usuario actualizado.');
      } else {
        await this.usuariosService.create(payload);
        await this.toastService.success('Usuario creado.');
      }
      await this.router.navigateByUrl('/admin/usuarios');
    } catch (error) {
      console.error('Error guardando usuario interno', error);
      await this.toastService.error('No fue posible guardar el usuario.');
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    void this.router.navigateByUrl('/admin/usuarios');
  }
}
