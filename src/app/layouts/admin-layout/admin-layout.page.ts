import { Component } from '@angular/core';
import { MenuController } from '@ionic/angular';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Usuario } from '../../core/models/usuario.model';
import { AuthService } from '../../core/services/auth.service';
import { AppRole } from '../../core/models/app-role.model';

interface AdminMenuItem {
  label: string;
  icon: string;
  route: string;
  roles: AppRole[];
}

@Component({
  standalone: false,
  selector: 'app-admin-layout', templateUrl: './admin-layout.page.html', styleUrls: ['./admin-layout.page.scss'] })
export class AdminLayoutPage {
  readonly profile$: Observable<Usuario | null> = this.authService.userProfile$();
  readonly authReady$ = this.authService.authReady$;
  readonly normalizedRole$: Observable<AppRole> = this.profile$.pipe(
    map((profile) => this.normalizeRole((profile?.rol || profile?.role || 'artista') as AppRole)),
  );
  readonly menuState$ = combineLatest([this.authReady$, this.profile$, this.normalizedRole$]).pipe(
    map(([authReady, profile, currentRole]) => ({
      authReady,
      profile,
      currentRole,
      isLoading: !authReady || (!!authReady && !profile),
      hasProfile: !!profile,
    })),
  );

  readonly menuItems: AdminMenuItem[] = [
    { label: 'Dashboard', icon: 'grid-outline', route: '/admin/dashboard', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
    { label: 'Agenda', icon: 'calendar-outline', route: '/admin/agenda', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
    { label: 'Facturación', icon: 'receipt-outline', route: '/admin/facturacion', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
    { label: 'Inventario', icon: 'cube-outline', route: '/admin/inventario', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
    { label: 'Compras', icon: 'cart-outline', route: '/admin/inventario/compras', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
    { label: 'Finanzas', icon: 'bar-chart-outline', route: '/admin/finanzas', roles: ['superadmin', 'admin', 'artist'] },
    { label: 'Usuarios', icon: 'people-outline', route: '/admin/usuarios', roles: ['superadmin', 'admin', 'artist'] },
     { label: 'Datos de empresa', icon: 'business-outline', route: '/admin/facturacion/empresa', roles: ['superadmin', 'admin', 'artist'] },
    { label: 'Mi perfil', icon: 'person-circle-outline', route: '/admin/perfil', roles: ['superadmin', 'admin', 'assistant', 'artist'] },
  ];
 
  constructor(private readonly menuCtrl: MenuController, private readonly authService: AuthService) {}

  async toggleMenu(): Promise<void> {
    await this.menuCtrl.toggle('admin-menu');
  }

  getInitials(profile: Usuario | null): string {
    const fullName = (profile?.displayName ?? profile?.nombre ?? '').trim();
    if (!fullName) return 'VT';
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  getRoleLabel(role?: AppRole): string {
    const normalized = this.normalizeRole((role || 'artist') as AppRole);
    if (normalized === 'superadmin') return 'Superadministrador';
    if (normalized === 'admin') return 'Administrador';
    if (normalized === 'assistant') return 'Asistente';
    return 'Artista';
  }

  canAccess(item: AdminMenuItem, role: AppRole): boolean {
    return item.roles.includes(role);
  }

  private normalizeRole(role: AppRole): AppRole {
    if (role === 'asistente') return 'assistant';
    if (role === 'artista') return 'artist';
    return role;
  }
}
