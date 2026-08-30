import { Component } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { map, Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AppRole } from '../../../core/models/app-role.model';
import { Usuario } from '../../../core/models/usuario.model';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthFacadeService } from '../../auth/services/auth-facade.service';
import { buildUserIdentityLabel } from '../../auth/helpers/auth.helper';
import { Router } from '@angular/router';
import { AdminShellThemeService } from '../../../core/services/admin-shell-theme.service';

@Component({
  standalone: false,
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
})
export class PerfilPage {
  readonly profile$: Observable<Usuario | null> = this.authFacade.userProfile$();
  readonly canManageCompany$: Observable<boolean> = this.profile$.pipe(
    map((profile) => ['superadmin', 'admin', 'artist'].includes(this.normalizeRole((profile?.rol || profile?.role || 'artista') as AppRole))),
  );
  isUploadingPhoto = false;

  constructor(
    private readonly authFacade: AuthFacadeService,
    private readonly auth: AngularFireAuth,
    private readonly firestore: AngularFirestore,
    private readonly router: Router,
    private readonly firestoreBase: FirestoreBaseService,
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

  identityLabel(profile: Usuario | null): string {
    return buildUserIdentityLabel(profile);
  }

  async logout(): Promise<void> {
    await this.authFacade.logout();
  }

  async goCompanyProfile(): Promise<void> {
    await this.router.navigateByUrl('/admin/facturacion/empresa');
  }

  getInitials(profile: Usuario | null): string {
    const base = (profile?.displayName ?? profile?.nombre ?? '').trim();
    if (!base) return 'VT';
    return base
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase() ?? '')
      .join('');
  }

  isProfileActive(profile: Usuario | null): boolean {
    return profile?.status !== 'inactive' && profile?.activo !== false;
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const user = await this.auth.currentUser;
    if (!user?.uid) {
      await this.toastService.error('Sesión no válida para actualizar foto.');
      input.value = '';
      return;
    }

    this.isUploadingPhoto = true;
    try {
      const ext = file.name.split('.').pop() || 'img';
      const objectPath = `usuarios/${user.uid}/perfil-${Date.now()}.${ext}`;
      const photoURL = await this.uploadProfilePhotoWithBucketFallback(file, objectPath);

      await this.persistProfilePhoto(user.uid, photoURL);

      await this.toastService.success('Foto de perfil actualizada.');
    } catch (error) {
      console.error('[Perfil] photo update error:', error);
      const rawCode = (error as { code?: unknown })?.code;
      const code = typeof rawCode === 'string' ? rawCode : String(rawCode ?? '');
      if (code.includes('permission-denied')) {
        await this.toastService.error('No tienes permisos para actualizar este perfil.');
      } else if (code.includes('unauthenticated')) {
        await this.toastService.error('Tu sesión expiró. Inicia sesión nuevamente.');
      } else {
        await this.toastService.error('No se pudo actualizar la foto de perfil.');
      }
    } finally {
      this.isUploadingPhoto = false;
      input.value = '';
      // Fuerza relectura reactiva del perfil en algunos navegadores
      await firstValueFrom(this.profile$);
    }
  }

  private async persistProfilePhoto(uid: string, photoURL: string): Promise<void> {
    const patch = {
      photoURL,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };

    try {
      await this.firestoreBase.update<Usuario>('usuarios', uid, patch);
    } catch (error) {
      const rawCode = (error as { code?: unknown })?.code;
      const code = typeof rawCode === 'string' ? rawCode : String(rawCode ?? '');
      if (code.includes('not-found')) {
        await this.firestore.doc<Partial<Usuario>>(`usuarios/${uid}`).set(patch, { merge: true });
        return;
      }
      throw error;
    }
  }

  /**
   * Algunos proyectos nuevos exponen bucket con dominio `firebasestorage.app`,
   * mientras que otros siguen operando con `appspot.com`.
   * Se prueba ambos para evitar error 404 por bucket no encontrado.
   */
  private async uploadProfilePhotoWithBucketFallback(file: File, objectPath: string): Promise<string> {
    const configured = environment.firebaseConfig.storageBucket || '';
    const normalized = configured.replace(/^gs:\/\//, '');
    const candidates = [
      normalized,
      normalized.includes('firebasestorage.app') ? normalized.replace('firebasestorage.app', 'appspot.com') : '',
      normalized.includes('appspot.com') ? normalized.replace('appspot.com', 'firebasestorage.app') : '',
    ].filter(Boolean);

    let lastError: unknown;
    for (const bucket of candidates) {
      try {
        const storage = getStorage(undefined, `gs://${bucket}`);
        const fileRef = ref(storage, objectPath);
        await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
        return await getDownloadURL(fileRef);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Storage bucket not available');
  }

  private normalizeRole(role: AppRole): AppRole {
    if (role === 'artista') return 'artist';
    if (role === 'asistente') return 'assistant';
    return role;
  }
}
