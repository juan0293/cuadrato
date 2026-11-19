import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type UsuariosTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class UsuariosThemeService {
  theme: UsuariosTheme = 'light';
  private initialized = false;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly router: Router,
  ) {}

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.theme = this.readStoredTheme();
    this.applyForUrl(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.applyForUrl(event.urlAfterRedirects));
  }

  toggle(): UsuariosTheme {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try {
      this.document.defaultView?.localStorage.setItem('usuarios-theme', this.theme);
    } catch {
      // El tema continúa activo aunque el almacenamiento local no esté disponible.
    }
    this.applyForUrl(this.router.url);
    return this.theme;
  }

  private readStoredTheme(): UsuariosTheme {
    try {
      const usersTheme = this.document.defaultView?.localStorage.getItem('usuarios-theme');
      const inventoryTheme = this.document.defaultView?.localStorage.getItem('inventario-theme');
      const billingTheme = this.document.defaultView?.localStorage.getItem('facturacion-theme');
      return (usersTheme || inventoryTheme || billingTheme) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private applyForUrl(url: string): void {
    const isUsersRoute = url.startsWith('/admin/usuarios');
    const body = this.document.body;
    body.classList.toggle('usuarios-light-theme', isUsersRoute && this.theme === 'light');
    body.classList.toggle('usuarios-dark-theme', isUsersRoute && this.theme === 'dark');
    if (!isUsersRoute) body.classList.remove('usuarios-light-theme', 'usuarios-dark-theme');
  }
}
