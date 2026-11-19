import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyProfile } from '../../../../core/models/company-profile.model';
import { CompanyProfileService } from '../../../../core/services/company-profile.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AdminShellThemeService } from '../../../../core/services/admin-shell-theme.service';

@Component({
  selector: 'app-company-profile',
  templateUrl: './company-profile.page.html',
  styleUrls: ['./company-profile.page.scss'],
  standalone: false,
})
export class CompanyProfilePage implements OnInit {
  @ViewChild('logoInput') logoInput?: ElementRef<HTMLInputElement>;

  isLoading = true;
  isSaving = false;
  isUploadingLogo = false;
  previewLogoUrl = '';
  profile?: CompanyProfile;

  readonly form = this.fb.nonNullable.group({
    companyTitle: ['', [Validators.required, Validators.minLength(2)]],
    ticketSubtitle: ['', [Validators.required, Validators.minLength(2)]],
    rnc: [''],
    telefono: [''],
    direccion: [''],
    logoUrl: [''],
    logoStoragePath: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly companyProfileService: CompanyProfileService,
    private readonly toastService: ToastService,
    private readonly themeService: AdminShellThemeService,
  ) {}

  get shellTheme(): 'light' | 'dark' {
    return this.themeService.theme;
  }

  toggleShellTheme(): void {
    this.themeService.toggle();
  }

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
  }

  get companyTitlePreview(): string {
    return this.form.controls.companyTitle.value.trim() || 'Vargas Tattoo';
  }

  get ticketSubtitlePreview(): string {
    return this.form.controls.ticketSubtitle.value.trim() || 'TICKET DE FACTURA';
  }

  get contactPreview(): string {
    return this.companyProfileService.buildContactLine(this.form.getRawValue());
  }

  get addressPreview(): string {
    return this.form.controls.direccion.value.trim() || 'Dirección';
  }

  async goBack(): Promise<void> {
    await this.router.navigateByUrl('/admin/facturacion');
  }

  openLogoPicker(): void {
    this.logoInput?.nativeElement.click();
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploadingLogo = true;
    try {
      const uploaded = await this.companyProfileService.uploadLogo(file);
      this.form.patchValue(uploaded);
      this.previewLogoUrl = uploaded.logoUrl;
      await this.toastService.success('Logo cargado correctamente.');
    } catch (error) {
      console.error('[CompanyProfile] logo upload error:', error);
      await this.toastService.error('No fue posible cargar el logo.');
    } finally {
      this.isUploadingLogo = false;
      input.value = '';
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const raw = this.form.getRawValue();
      const rnc = raw.rnc.trim();
      const telefono = raw.telefono.trim();
      const direccion = raw.direccion.trim();
      const logoUrl = raw.logoUrl.trim();
      const logoStoragePath = raw.logoStoragePath.trim();
      await this.companyProfileService.saveCurrentProfile({
        companyTitle: raw.companyTitle.trim(),
        ticketSubtitle: raw.ticketSubtitle.trim(),
        ...(rnc ? { rnc } : {}),
        ...(telefono ? { telefono } : {}),
        ...(direccion ? { direccion } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(logoStoragePath ? { logoStoragePath } : {}),
      });
      await this.toastService.success('Datos de empresa actualizados.');
      await this.loadProfile();
    } catch (error) {
      console.error('[CompanyProfile] save error:', error);
      await this.toastService.error('No fue posible guardar los datos de empresa.');
    } finally {
      this.isSaving = false;
    }
  }

  private async loadProfile(): Promise<void> {
    this.isLoading = true;
    try {
      const profile = await this.companyProfileService.getCurrentProfile();
      this.profile = profile;
      this.previewLogoUrl = profile.logoUrl || '';
      this.form.reset({
        companyTitle: profile.companyTitle,
        ticketSubtitle: profile.ticketSubtitle || 'TICKET DE FACTURA',
        rnc: profile.rnc || '',
        telefono: profile.telefono || '',
        direccion: profile.direccion || '',
        logoUrl: profile.logoUrl || '',
        logoStoragePath: profile.logoStoragePath || '',
      });
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } finally {
      this.isLoading = false;
    }
  }
}
