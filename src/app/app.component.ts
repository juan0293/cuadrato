import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { resolveHomeByRole } from './core/helpers/auth.helper';
import { AdminShellThemeService } from './core/services/admin-shell-theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  private sub?: Subscription;
  private bootTimerId?: number;
  private hideOverlayTimerId?: number;
  private bootIndex = 0;

  showBootOverlay = true;
  isOffline = !navigator.onLine;
  bootStage = 'Inicio seguro';
  bootMessage = 'Validando tu sesión…';
  private readonly bootSteps = [
    { stage: 'Inicio seguro', message: 'Validando tu sesión…' },
    { stage: 'Sincronización', message: 'Sincronizando caja, inventario y finanzas…' },
    { stage: 'Facturación', message: 'Cargando módulos de facturación…' },
    { stage: 'Operaciones', message: 'Organizando tus operaciones…' },
    { stage: 'Finanzas', message: 'Cuadrando la información de tu negocio…' },
    { stage: 'Listo', message: 'Listo para vender con control.' },
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly themeService: AdminShellThemeService,
  ) {
    this.themeService.initialize();
    this.startBootRotation();
    this.bindNetworkStatus();
    this.bootstrapSession();
  }

  get shellTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  private bootstrapSession(): void {
    this.sub = combineLatest([
      this.authService.loadingAuth$(),
      this.authService.isAuthenticated$(),
      this.authService.roleState$(),
    ]).subscribe(async ([loadingAuth, isAuthenticated, role]) => {
      if (!loadingAuth) {
        this.finishBootOverlay();
      }
      if (loadingAuth || !isAuthenticated) return;

      const isAuthRoute = this.router.url.startsWith('/auth') || this.router.url === '/';
      if (!isAuthRoute) return;

      await this.router.navigateByUrl(resolveHomeByRole(role), { replaceUrl: true });
    });
  }

  private startBootRotation(): void {
    this.applyBootStep(0);
    this.bootTimerId = window.setInterval(() => {
      this.bootIndex = (this.bootIndex + 1) % this.bootSteps.length;
      this.applyBootStep(this.bootIndex);
    }, 1300);
  }

  private applyBootStep(index: number): void {
    const step = this.bootSteps[index] || this.bootSteps[0];
    this.bootStage = step.stage;
    this.bootMessage = step.message;
  }

  private finishBootOverlay(): void {
    if (!this.showBootOverlay) return;
    this.clearBootTimer();
    this.applyBootStep(this.bootSteps.length - 1);
    this.hideOverlayTimerId = window.setTimeout(() => {
      this.showBootOverlay = false;
    }, 300);
  }

  private bindNetworkStatus(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private readonly handleOnline = (): void => {
    this.isOffline = false;
  };

  private readonly handleOffline = (): void => {
    this.isOffline = true;
  };

  private clearBootTimer(): void {
    if (this.bootTimerId) {
      window.clearInterval(this.bootTimerId);
      this.bootTimerId = undefined;
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.clearBootTimer();
    if (this.hideOverlayTimerId) {
      window.clearTimeout(this.hideOverlayTimerId);
      this.hideOverlayTimerId = undefined;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}
