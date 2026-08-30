import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppRole } from '../../../core/models/app-role.model';
import { AdminShellThemeService } from '../../../core/services/admin-shell-theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { CompanyProfileService } from '../../../core/services/company-profile.service';

interface QuickAction {
  title: string;
  description: string;
  icon: string;
  route: string;
  roles: AppRole[];
}

@Component({
  standalone: false,
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage {
  readonly normalizedRole$: Observable<AppRole> = this.authService.userProfile$().pipe(
    map((profile) => this.normalizeRole((profile?.rol || profile?.role || 'artista') as AppRole)),
  );

  readonly companyProfile$ = this.companyProfileService.watchCurrentProfile();

  readonly quickActions: QuickAction[] = [
    {
      title: 'Dashboard',
      description: 'Vista general del negocio.',
      icon: 'grid-outline',
      route: '/admin/dashboard',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
    {
      title: 'Agenda',
      description: 'Control de citas y planificación.',
      icon: 'calendar-outline',
      route: '/admin/agenda',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
       {
      title: 'Facturación',
      description: 'Ventas, tickets y comprobantes.',
      icon: 'receipt-outline',
      route: '/admin/facturacion',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
    {
      title: 'Inventario',
      description: 'Productos, stock y movimientos.',
      icon: 'cube-outline',
      route: '/admin/inventario',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
    {
      title: 'Compras',
      description: 'Facturas de proveedor y entradas de inventario.',
      icon: 'cart-outline',
      route: '/admin/inventario/compras',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
    {
      title: 'Finanzas',
      description: 'Ingresos, gastos y balance.',
      icon: 'bar-chart-outline',
      route: '/admin/finanzas',
      roles: ['superadmin', 'admin', 'artist'],
    },
    {
      title: 'Movimientos financieros',
      description: 'Revisa el historial financiero operativo.',
      icon: 'swap-horizontal-outline',
      route: '/admin/finanzas/movimientos',
      roles: ['superadmin', 'admin', 'artist'],
    },
    {
      title: 'Usuarios',
      description: 'Roles, accesos y seguridad.',
      icon: 'people-outline',
      route: '/admin/usuarios',
      roles: ['superadmin', 'admin', 'artist'],
    },
    {
      title: 'Mi perfil',
      description: 'Datos de cuenta y preferencias.',
      icon: 'person-circle-outline',
      route: '/admin/perfil',
      roles: ['superadmin', 'admin', 'assistant', 'artist'],
    },
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly companyProfileService: CompanyProfileService,
    private readonly themeService: AdminShellThemeService,
  ) {
    this.themeService.initialize();
  }

  get shellTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  toggleShellTheme(): void {
    this.themeService.toggle();
  }

  getCompanyInitials(companyTitle?: string): string {
    const words = String(companyTitle || 'Empresa').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('') || 'EM';
  }

  canAccess(item: QuickAction, role: AppRole): boolean {
    return item.roles.includes(role);
  }

  private normalizeRole(role: AppRole): AppRole {
    if (role === 'asistente') return 'assistant';
    if (role === 'artista') return 'artist';
    return role;
  }
}
