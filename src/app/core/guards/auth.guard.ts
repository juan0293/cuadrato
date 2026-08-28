import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, Observable, take, map } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return combineLatest([
      this.authService.loadingAuth$(),
      this.authService.isAuthenticated$(),
    ]).pipe(
      filter(([loadingAuth]) => !loadingAuth),
      take(1),
      map(([loadingAuth, ok]) => {
        return ok ? true : this.router.parseUrl('/auth/login');
      }),
    );
  }
}
