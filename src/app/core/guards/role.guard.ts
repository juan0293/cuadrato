import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, Observable, take, map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AppRole } from '../models/app-role.model';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  /**
   * Evita fuga de permisos entre módulos al comparar el rol
   * requerido por ruta contra el rol real en perfil de usuario.
   */
  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const allowedRoles = (route.data['roles'] ?? []) as AppRole[];
    return combineLatest([
      this.authService.loadingAuth$(),
      this.authService.roleState$(),
    ]).pipe(
      filter(([loadingAuth]) => !loadingAuth),
      take(1),
      map(([_, role]) => {
        const currentRole = this.normalizeRole(role);

        // Requisito operativo: artist con acceso total a la app interna.
        if (currentRole === 'artist') return true;

        const normalizedAllowed = allowedRoles.map((role) => this.normalizeRole(role));
        return normalizedAllowed.includes(currentRole) ? true : this.router.parseUrl('/auth/login');
      }),
    );
  }

  private normalizeRole(role: AppRole): AppRole {
    if (role === 'asistente') return 'assistant';
    if (role === 'artista') return 'artist';
    return role;
  }
}
