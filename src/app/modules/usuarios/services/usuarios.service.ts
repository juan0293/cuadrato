import { Injectable } from '@angular/core';
import { AngularFireFunctions } from '@angular/fire/compat/functions';
import { Observable, firstValueFrom, map } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { UsuarioModel, UserRole, UserStatus } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly collectionPath = 'usuarios';

  constructor(
    private readonly firestoreBase: FirestoreBaseService,
    private readonly functions: AngularFireFunctions,
  ) {}

  list(): Observable<UsuarioModel[]> {
    return this.firestoreBase.list<UsuarioModel>(this.collectionPath).pipe(
      map((users) =>
        users.map((user) => ({
          ...user,
          displayName: user.displayName ?? user.nombre ?? '',
          role: (user.role ?? user.rol ?? 'artist') as UserRole,
          status: (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus,
        })),
      ),
    );
  }

  getById(id: string): Observable<UsuarioModel> {
    return this.firestoreBase.getById<UsuarioModel>(this.collectionPath, id).pipe(
      map((user) => ({
        ...user,
        displayName: user.displayName ?? user.nombre ?? '',
        role: (user.role ?? user.rol ?? 'artist') as UserRole,
        status: (user.status ?? (user.activo === false ? 'inactive' : 'active')) as UserStatus,
      })),
    );
  }

  async createUser(payload: { companyId: string; displayName: string; email: string; role: UserRole; status: UserStatus; password?: string }): Promise<void> {
    const callable = this.functions.httpsCallable('createUser');
    await firstValueFrom(callable(payload));
  }

  async updateUser(payload: {
    userId: string;
    companyId: string;
    displayName: string;
    role: UserRole;
    status: UserStatus;
  }): Promise<void> {
    const callable = this.functions.httpsCallable('updateUser');
    await firstValueFrom(callable(payload));
  }

  async toggleUserStatus(payload: { userId: string; companyId: string; status: UserStatus }): Promise<void> {
    const callable = this.functions.httpsCallable('toggleUserStatus');
    await firstValueFrom(callable(payload));
  }

  /**
   * Compatibilidad temporal con formularios legacy del módulo usuarios.
   * Mantiene el contrato existente mientras la UI migra 100% a Cloud Functions.
   */
  create(payload: UsuarioModel): Promise<string> {
    return this.firestoreBase.create<UsuarioModel>(this.collectionPath, payload);
  }

  /**
   * Compatibilidad temporal para edición en rutas legacy.
   * No elimina ni modifica la política de inactivación por estado.
   */
  update(id: string, payload: Partial<UsuarioModel>): Promise<void> {
    return this.firestoreBase.update<UsuarioModel>(this.collectionPath, id, payload);
  }
}
