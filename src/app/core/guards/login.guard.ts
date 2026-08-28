import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, Observable, take } from 'rxjs';
import { resolveHomeByRole } from '../helpers/auth.helper';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class LoginGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    return combineLatest([
      this.authService.loadingAuth$(),
      this.authService.isAuthenticated$(),
      this.authService.roleState$(),
    ]).pipe(
      filter(([loadingAuth]) => !loadingAuth),
      take(1),
      map(([_, isAuthenticated, role]) => {
        if (!isAuthenticated) return true;
        return this.router.createUrlTree([resolveHomeByRole(role)]);
      }),
    );
  }
}
