import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, firstValueFrom, map, Observable } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { roleLabel } from '../helpers/usuarios.helper';
import { UsuarioModel, UserRole, UserStatus } from '../models/usuario.model';
import { UsuariosService } from '../services/usuarios.service';

@Component({
  standalone: false,
  selector: 'app-usuarios',
  templateUrl: './usuarios.page.html',
  styleUrls: ['./usuarios.page.scss'],
})
export class UsuariosPage {
  readonly roleFilters: Array<'all' | UserRole> = ['all', 'superadmin', 'admin', 'assistant', 'artist'];

  searchTerm = '';
  roleFilter: 'all' | UserRole = 'all';
  selectedUser: UsuarioModel | null = null;
  isModalOpen = false;
  isViewMode = false;
  private currentCompanyId = '';
  private readonly searchTerm$ = new BehaviorSubject<string>('');
  private readonly roleFilter$ = new BehaviorSubject<'all' | UserRole>('all');

  readonly currentRole$: Observable<UserRole> = this.authService.userProfile$().pipe(
    map((profile) => {
      this.currentCompanyId = profile?.companyId ?? this.currentCompanyId ?? '';
      return (profile?.rol ?? profile?.role ?? 'artist') as UserRole;
    }),
  );

  readonly users$: Observable<UsuarioModel[]> = combineLatest([this.usuariosService.list()]).pipe(
    map(([users]) => users),
  );

  readonly filteredUsers$: Observable<UsuarioModel[]> = combineLatest([this.users$, this.currentRole$, this.searchTerm$, this.roleFilter$]).pipe(
    map(([users, _, searchTerm, roleFilter]) => {
      const byRole = roleFilter === 'all' ? users : users.filter((user) => user.role === roleFilter || user.rol === roleFilter);
      const query = searchTerm.trim().toLowerCase();
      if (!query) return byRole;
      return byRole.filter((user) => {
        const name = (user.displayName ?? user.nombre ?? '').toLowerCase();
        return name.includes(query) || user.email.toLowerCase().includes(query);
      });
    }),
  );

  readonly userForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['artist' as UserRole, [Validators.required]],
    status: ['active' as UserStatus, [Validators.required]],
    companyId: ['', [Validators.required]],
    password: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly usuariosService: UsuariosService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
  ) {}

  roleLabel = roleLabel;

  readonly roleLabelMap: Record<UserRole, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    assistant: 'Assistant',
    artist: 'Artist',
    asistente: 'Asistente',
    artista: 'Artista',
  };

  getRoleFilterLabel(filter: 'all' | UserRole | string | null | undefined): string {
    if (!filter || filter === 'all') return 'Todos los roles';
    if (Object.prototype.hasOwnProperty.call(this.roleLabelMap, filter)) {
      return this.roleLabelMap[filter as UserRole];
    }
    return String(filter);
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLIonSearchbarElement;
    this.searchTerm = (target.value ?? '').toString();
    this.searchTerm$.next(this.searchTerm);
  }

  onRoleFilterChange(value: string | number | undefined): void {
    if (!value) return;
    this.roleFilter = value as 'all' | UserRole;
    this.roleFilter$.next(this.roleFilter);
  }

  async canCreate(): Promise<boolean> {
    const role = await firstValueFrom(this.currentRole$);
    return role === 'superadmin' || role === 'admin';
  }

  async canEdit(): Promise<boolean> {
    return this.canCreate();
  }

  async canToggle(): Promise<boolean> {
    return this.canCreate();
  }

  async openCreateModal(): Promise<void> {
    if (!(await this.canCreate())) return;
    this.selectedUser = null;
    this.isViewMode = false;
    this.userForm.reset({
      displayName: '',
      email: '',
      role: 'artist',
      status: 'active',
      companyId: this.currentCompanyId,
      password: '',
    });
    this.isModalOpen = true;
  }

  openDetail(user: UsuarioModel): void {
    this.selectedUser = user;
    this.isViewMode = true;
    this.userForm.patchValue({
      displayName: user.displayName ?? user.nombre ?? '',
      email: user.email,
      role: (user.role ?? user.rol ?? 'artist') as UserRole,
      status: (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus,
      companyId: user.companyId ?? this.currentCompanyId,
      password: '',
    });
    this.isModalOpen = true;
  }

  async openEdit(user: UsuarioModel): Promise<void> {
    if (!(await this.canEdit())) return;
    this.selectedUser = user;
    this.isViewMode = false;
    this.userForm.patchValue({
      displayName: user.displayName ?? user.nombre ?? '',
      email: user.email,
      role: (user.role ?? user.rol ?? 'artist') as UserRole,
      status: (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus,
      companyId: user.companyId ?? this.currentCompanyId,
      password: '',
    });
    this.isModalOpen = true;
  }

  async toggleStatus(user: UsuarioModel): Promise<void> {
    if (!(await this.canToggle()) || !user.id) return;
    const currentStatus: UserStatus = (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus;
    const nextStatus: UserStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await this.usuariosService.toggleUserStatus({
      userId: user.id,
      companyId: user.companyId ?? this.currentCompanyId,
      status: nextStatus,
    });
    await this.toastService.success(`Usuario ${nextStatus === 'active' ? 'activado' : 'inactivado'}.`);
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.isViewMode = false;
    this.selectedUser = null;
  }

  async saveUser(): Promise<void> {
    if (this.userForm.invalid || this.isViewMode) return;

    const raw = this.userForm.getRawValue();
    const companyId = raw.companyId || this.currentCompanyId;
    if (!companyId) {
      await this.toastService.error('No se encontró companyId para esta sesión.');
      return;
    }

    if (!this.selectedUser?.id) {
      await this.usuariosService.createUser({
        companyId,
        displayName: raw.displayName.trim(),
        email: raw.email.trim().toLowerCase(),
        role: raw.role,
        status: raw.status,
        password: raw.password?.trim() || undefined,
      });
      await this.toastService.success('Usuario creado correctamente.');
      this.closeModal();
      return;
    }

    await this.usuariosService.updateUser({
      userId: this.selectedUser.id,
      companyId,
      displayName: raw.displayName.trim(),
      role: raw.role,
      status: raw.status,
    });
    await this.toastService.success('Usuario actualizado correctamente.');
    this.closeModal();
  }

  statusColor(user: UsuarioModel): string {
    const status: UserStatus = (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus;
    return status === 'active' ? 'success' : 'medium';
  }

  statusLabel(user: UsuarioModel): string {
    const status: UserStatus = (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus;
    return status === 'active' ? 'Activo' : 'Inactivo';
  }

  getRoleKey(user: UsuarioModel): UserRole {
    return (user.role ?? user.rol ?? 'artist') as UserRole;
  }

  roleBadgeClass(user: UsuarioModel): string {
    const role = this.getRoleKey(user);
    if (role === 'superadmin') return 'role-superadmin';
    if (role === 'admin') return 'role-admin';
    if (role === 'assistant' || role === 'asistente') return 'role-assistant';
    return 'role-artist';
  }

  statusBadgeClass(user: UsuarioModel): string {
    const status: UserStatus = (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus;
    return status === 'active' ? 'status-active' : 'status-inactive';
  }

  formatUserDate(user: UsuarioModel): string {
    const dateCandidate = user.createdAt ?? user.fechaCreacion;
    if (!dateCandidate) return 'Sin fecha';

    const parsed = new Date(dateCandidate as string);
    if (Number.isNaN(parsed.getTime())) return 'Sin fecha';

    return parsed.toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' });
  }
}
