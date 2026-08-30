import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, combineLatest, filter, take } from 'rxjs';
import { AuthFacadeService } from '../services/auth-facade.service';
import { LoadingService } from '../../../core/services/loading.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { resolveHomeByRole } from '../../../core/helpers/auth.helper';
import { AdminShellThemeService } from '../../../core/services/admin-shell-theme.service';

@Component({
  standalone: false,
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
})
export class AuthPage implements OnInit, OnDestroy {
  private readonly sub = new Subscription();
  submitted = false;
  showPassword = false;
  readonly logoPath: string | null = "./assets/icon/cuadrato.png";

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authFacade: AuthFacadeService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly loadingService: LoadingService,
    private readonly toastService: ToastService,
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

  ngOnInit(): void {
    this.sub.add(
      combineLatest([
        this.authService.authReady$,
        this.authService.isAuthenticated$(),
        this.authService.roleState$(),
      ])
        .pipe(
          filter(([ready]) => ready),
          take(1),
        )
        .subscribe(async ([_, isAuthenticated, role]) => {
          if (!isAuthenticated) return;
          await this.router.navigateByUrl(resolveHomeByRole(role), { replaceUrl: true });
        }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get emailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || this.submitted);
  }

  get passwordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.touched || this.submitted);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async submit(): Promise<void> {
    this.submitted = true;

    if (this.form.invalid) {
      await this.toastService.error('Revisa tus credenciales e inténtalo de nuevo.');
      return;
    }

    try {
      await this.loadingService.show('Iniciando sesión...');
      await this.authFacade.login(this.form.getRawValue());
    } catch (error) {
      console.error(error);
      const normalized = error as { code?: string | number; message?: string; error?: { message?: string } };
      const code = normalized?.code ?? normalized?.error?.message;
      const detail = normalized?.message?.slice(0, 120);
      await this.toastService.error(code ? `No fue posible iniciar sesión (${code})` : 'No fue posible iniciar sesión.');
      if (detail) {
        console.warn('Login detail:', detail);
      }
    } finally {
      await this.loadingService.hide();
    }
  }
}
