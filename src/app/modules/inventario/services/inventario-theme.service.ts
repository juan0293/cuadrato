import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type InventarioTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class InventarioThemeService {
  theme: InventarioTheme = 'light';
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

  toggle(): InventarioTheme {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try {
      this.document.defaultView?.localStorage.setItem('inventario-theme', this.theme);
    } catch {
      // El tema sigue activo aunque el almacenamiento local esté bloqueado.
    }
    this.applyForUrl(this.router.url);
    return this.theme;
  }

  private readStoredTheme(): InventarioTheme {
    try {
      const savedTheme = this.document.defaultView?.localStorage.getItem('inventario-theme');
      const billingTheme = this.document.defaultView?.localStorage.getItem('facturacion-theme');
      return (savedTheme || billingTheme) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private applyForUrl(url: string): void {
    const isInventoryRoute = url.startsWith('/admin/inventario') || url.startsWith('/admin/facturacion/cuentas-por-cobrar');
    const body = this.document.body;
    body.classList.toggle('inventario-light-theme', isInventoryRoute && this.theme === 'light');
    body.classList.toggle('inventario-dark-theme', isInventoryRoute && this.theme === 'dark');
    if (!isInventoryRoute) {
      body.classList.remove('inventario-light-theme', 'inventario-dark-theme');
    }
  }
}
