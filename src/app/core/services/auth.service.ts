import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import { catchError, distinctUntilChanged, filter, take } from 'rxjs/operators';
import { FirestoreBaseService } from './firestore-base.service';
import { Usuario } from '../models/usuario.model';
import { AppRole } from '../models/app-role.model';
import { resolveHomeByRole } from '../helpers/auth.helper';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user$: Observable<firebase.User | null>;
  readonly currentUser$: Observable<firebase.User | null>;
  readonly userData$: Observable<Usuario | null>;
  readonly role$: Observable<AppRole>;
  readonly authReady$: Observable<boolean>;
  readonly isAuthenticatedState$: Observable<boolean>;
  readonly loadingAuthState$: Observable<boolean>;

  private readonly loadingAuthSubject = new BehaviorSubject<boolean>(true);
  private readonly authReadyPromise: Promise<void>;

  constructor(private readonly auth: AngularFireAuth, private readonly router: Router, private readonly firestoreBase: FirestoreBaseService) {
    this.currentUser$ = this.auth.authState.pipe(
      distinctUntilChanged((prev, next) => prev?.uid === next?.uid),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.user$ = this.currentUser$;
    this.loadingAuthState$ = this.loadingAuthSubject.asObservable();
    this.authReady$ = this.loadingAuthState$.pipe(
      map((loading) => !loading),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.isAuthenticatedState$ = this.currentUser$.pipe(map((user) => !!user));
    this.userData$ = this.currentUser$.pipe(
      switchMap((user) => {
        if (!user?.uid) return of(null);
        return this.firestoreBase.getById<Usuario>('usuarios', user.uid).pipe(catchError(() => of(null)));
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.role$ = this.userData$.pipe(
      map((profile) => this.normalizeRole((profile?.rol || profile?.role || 'artista') as AppRole)),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    /**
     * Persistencia LOCAL en compat API:
     * mantiene la sesión entre recargas/cierre de pestaña (web/PWA).
     */
    void this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => void 0);

    /**
     * Marca auth como "resuelto" tras el primer evento de authState.
     * Evita redirecciones prematuras de guards mientras Firebase restaura sesión.
     */
    this.authReadyPromise = firstValueFrom(this.currentUser$.pipe(take(1)))
      .then(() => {
        this.loadingAuthSubject.next(false);
      })
      .catch(() => {
        this.loadingAuthSubject.next(false);
      });
  }

  /**
   * Login con Firebase Auth; la ruta final se decide por rol para
   * evitar que perfiles no autorizados entren a módulos incorrectos.
   */
  async login(email: string, password: string): Promise<void> {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    try {
      await this.auth.signInWithEmailAndPassword(normalizedEmail, normalizedPassword);
    } catch (error) {
      /**
       * Reintento único para errores transitorios detectados en algunos entornos
       * (código numérico o errores de conectividad intermitente).
       */
      const code = (error as { code?: string | number })?.code;
      const isTransient = typeof code === 'number' || code === 'auth/network-request-failed';
      if (!isTransient) throw error;
      await this.auth.signInWithEmailAndPassword(normalizedEmail, normalizedPassword);
    }

    const role = await this.getCurrentUserRole();
    await this.router.navigateByUrl(resolveHomeByRole(role), { replaceUrl: true });
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await firstValueFrom(
      this.isAuthenticatedState$.pipe(
        filter((isAuthenticated) => !isAuthenticated),
        take(1),
      ),
    );
    await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  isAuthenticated$(): Observable<boolean> {
    return this.isAuthenticatedState$;
  }

  userProfile$(): Observable<Usuario | null> {
    return this.userData$;
  }

  roleState$(): Observable<AppRole> {
    return this.role$;
  }

  loadingAuth$(): Observable<boolean> {
    return this.loadingAuthState$;
  }

  async waitForAuthReady(): Promise<void> {
    await this.authReadyPromise;
  }

  async getCurrentUserRole(): Promise<AppRole> {
    try {
      return await firstValueFrom(this.role$.pipe(take(1)));
    } catch {
      return 'artista';
    }
  }

  private normalizeRole(role: AppRole): AppRole {
    if (role === 'asistente') return 'assistant';
    if (role === 'artista') return 'artist';
    return role;
  }
}
