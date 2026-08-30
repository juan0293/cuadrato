import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type FinanzasTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class FinanzasThemeService {
  theme: FinanzasTheme = 'light';
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

  toggle(): FinanzasTheme {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try {
      this.document.defaultView?.localStorage.setItem('finanzas-theme', this.theme);
    } catch {
      // El cambio sigue activo aunque el almacenamiento local no esté disponible.
    }
    this.applyForUrl(this.router.url);
    this.document.defaultView?.dispatchEvent(new CustomEvent('finanzas-theme-change', { detail: this.theme }));
    return this.theme;
  }

  private readStoredTheme(): FinanzasTheme {
    try {
      const saved = this.document.defaultView?.localStorage.getItem('finanzas-theme');
      const inventory = this.document.defaultView?.localStorage.getItem('inventario-theme');
      const billing = this.document.defaultView?.localStorage.getItem('facturacion-theme');
      return (saved || inventory || billing) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private applyForUrl(url: string): void {
    const isFinanceRoute = url.startsWith('/admin/finanzas');
    const body = this.document.body;
    body.classList.toggle('finanzas-light-theme', isFinanceRoute && this.theme === 'light');
    body.classList.toggle('finanzas-dark-theme', isFinanceRoute && this.theme === 'dark');
    if (!isFinanceRoute) body.classList.remove('finanzas-light-theme', 'finanzas-dark-theme');
  }
}
