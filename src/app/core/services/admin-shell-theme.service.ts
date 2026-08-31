import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type AdminShellTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class AdminShellThemeService {
  theme: AdminShellTheme = 'light';
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

  toggle(): AdminShellTheme {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try {
      this.document.defaultView?.localStorage.setItem('admin-shell-theme', this.theme);
    } catch {
      // El tema continúa activo aunque el almacenamiento local no esté disponible.
    }
    this.applyForUrl(this.router.url);
    return this.theme;
  }

  private readStoredTheme(): AdminShellTheme {
    try {
      const shellTheme = this.document.defaultView?.localStorage.getItem('admin-shell-theme');
      const inventoryTheme = this.document.defaultView?.localStorage.getItem('inventario-theme');
      const billingTheme = this.document.defaultView?.localStorage.getItem('facturacion-theme');
      return (shellTheme || inventoryTheme || billingTheme) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private applyForUrl(url: string): void {
    const usesShellTheme = url.startsWith('/admin/dashboard')
      || url.startsWith('/admin/perfil')
      || url.startsWith('/admin/facturacion/empresa');
    const body = this.document.body;
    body.classList.toggle('admin-shell-light-theme', usesShellTheme && this.theme === 'light');
    body.classList.toggle('admin-shell-dark-theme', usesShellTheme && this.theme === 'dark');
    if (!usesShellTheme) body.classList.remove('admin-shell-light-theme', 'admin-shell-dark-theme');
  }
}
