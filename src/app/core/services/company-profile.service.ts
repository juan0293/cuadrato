import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { firstValueFrom, Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CompanyProfile } from '../models/company-profile.model';
import { Usuario } from '../models/usuario.model';
import { AuthService } from './auth.service';

interface CompanyProfileContext {
  companyId: string;
  docId: string;
  uid: string;
}

@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private readonly collectionPath = 'configuracionEmpresa';

  constructor(
    private readonly afAuth: AngularFireAuth,
    private readonly afs: AngularFirestore,
    private readonly authService: AuthService,
  ) {}

  watchCurrentProfile(): Observable<CompanyProfile> {
    return new Observable<CompanyProfile>((subscriber) => {
      let unsubscribe: (() => void) | undefined;

      void this.resolveContext()
        .then((ctx) => {
          unsubscribe = this.afs.firestore
            .collection(this.collectionPath)
            .doc(ctx.docId)
            .onSnapshot(
              (snapshot) => {
                subscriber.next(this.normalizeProfile(snapshot.exists ? {
                  id: snapshot.id,
                  ...(snapshot.data() as CompanyProfile),
                } : { companyId: ctx.companyId }));
              },
              (error) => subscriber.error(error),
            );
        })
        .catch((error) => subscriber.error(error));

      return () => {
        if (unsubscribe) unsubscribe();
      };
    });
  }

  async getCurrentProfile(): Promise<CompanyProfile> {
    const ctx = await this.resolveContext();
    const snapshot = await this.afs.firestore.collection(this.collectionPath).doc(ctx.docId).get();
    return this.normalizeProfile(snapshot.exists ? {
      id: snapshot.id,
      ...(snapshot.data() as CompanyProfile),
    } : { companyId: ctx.companyId });
  }

  async saveCurrentProfile(payload: Partial<CompanyProfile>): Promise<void> {
    const ctx = await this.resolveContext();
    const docRef = this.afs.firestore.collection(this.collectionPath).doc(ctx.docId);
    const current = await docRef.get();
    const now = new Date().toISOString();
    const existing = current.exists ? (current.data() as CompanyProfile) : undefined;

    const data = this.sanitizeUndefined<CompanyProfile>({
      companyId: ctx.companyId,
      companyTitle: String(payload.companyTitle || existing?.companyTitle || 'CUADRATO').trim() || 'CUADRATO',
      ticketSubtitle: String(payload.ticketSubtitle || existing?.ticketSubtitle || 'TICKET DE FACTURA').trim() || 'TICKET DE FACTURA',
      rnc: this.cleanOptionalText(payload.rnc ?? existing?.rnc),
      telefono: this.cleanOptionalText(payload.telefono ?? existing?.telefono),
      direccion: this.cleanOptionalText(payload.direccion ?? existing?.direccion),
      logoUrl: this.cleanOptionalText(payload.logoUrl ?? existing?.logoUrl),
      logoStoragePath: this.cleanOptionalText(payload.logoStoragePath ?? existing?.logoStoragePath),
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || ctx.uid,
      updatedAt: now,
      updatedBy: ctx.uid,
    });

    await docRef.set(data, { merge: true });
  }

  async uploadLogo(file: File): Promise<{ logoUrl: string; logoStoragePath: string }> {
    const ctx = await this.resolveContext();
    const ext = file.name.split('.').pop() || 'png';
    const objectPath = `configuracion-empresa/${ctx.docId}/logo-${Date.now()}.${ext}`;
    const logoUrl = await this.uploadWithBucketFallback(file, objectPath);
    return { logoUrl, logoStoragePath: objectPath };
  }

  async getBrandingSnapshot(): Promise<{ profile: CompanyProfile; logoDataUrl?: string }> {
    const profile = await this.getCurrentProfile();
    const logoDataUrl = await this.resolveLogoDataUrl(profile.logoUrl);
    return { profile, logoDataUrl };
  }

  buildContactLine(profile?: CompanyProfile | null): string {
    const left = this.cleanOptionalText(profile?.rnc) || 'RNC';
    const right = this.cleanOptionalText(profile?.telefono) || 'Teléfono';
    return `${left} • ${right}`;
  }

  normalizeProfile(profile?: Partial<CompanyProfile> | null): CompanyProfile {
    return {
      id: profile?.id,
      companyId: this.cleanOptionalText(profile?.companyId) || 'default',
      companyTitle: this.cleanOptionalText(profile?.companyTitle) || 'Vargas Tattoo',
      ticketSubtitle: this.cleanOptionalText(profile?.ticketSubtitle) || 'TICKET DE FACTURA',
      rnc: this.cleanOptionalText(profile?.rnc),
      telefono: this.cleanOptionalText(profile?.telefono),
      direccion: this.cleanOptionalText(profile?.direccion),
      logoUrl: this.cleanOptionalText(profile?.logoUrl),
      logoStoragePath: this.cleanOptionalText(profile?.logoStoragePath),
      createdAt: this.cleanOptionalText(profile?.createdAt),
      createdBy: this.cleanOptionalText(profile?.createdBy),
      updatedAt: this.cleanOptionalText(profile?.updatedAt),
      updatedBy: this.cleanOptionalText(profile?.updatedBy),
    };
  }

  private async resolveContext(): Promise<CompanyProfileContext> {
    const [authUser, profile] = await Promise.all([
      this.afAuth.currentUser,
      firstValueFrom(this.authService.userProfile$().pipe(take(1))),
    ]);

    const uid = authUser?.uid || profile?.id || '';
    if (!uid) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const companyId = this.resolveCompanyId(profile, uid);
    return {
      companyId,
      docId: companyId,
      uid,
    };
  }

  private resolveCompanyId(profile: Usuario | null, uid: string): string {
    const companyId = String(profile?.companyId || '').trim();
    return companyId || `company-${uid}`;
  }

  private cleanOptionalText(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : undefined;
  }

  private sanitizeUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== undefined)
        .map((item) => this.sanitizeUndefined(item)) as unknown as T;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, this.sanitizeUndefined(item)]);

      return Object.fromEntries(entries) as T;
    }

    return value;
  }

  private async resolveLogoDataUrl(logoUrl?: string): Promise<string | undefined> {
    const targets = [this.cleanOptionalText(logoUrl), 'assets/icon/cuadrato.png', 'assets/icon/logo.jpg'].filter(Boolean) as string[];

    for (const target of targets) {
      try {
        const response = await fetch(target);
        if (!response.ok) continue;
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('LOGO_READ_ERROR'));
          reader.readAsDataURL(blob);
        });
        if (dataUrl) return dataUrl;
      } catch {
        // fallback silencioso al siguiente candidato
      }
    }

    return undefined;
  }

  private async uploadWithBucketFallback(file: File, objectPath: string): Promise<string> {
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

    throw lastError ?? new Error('STORAGE_BUCKET_NOT_AVAILABLE');
  }
}
