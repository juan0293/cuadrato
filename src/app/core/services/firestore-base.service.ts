import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class FirestoreBaseService {
  constructor(private readonly firestore: AngularFirestore) {}

  /**
   * Firestore no acepta campos undefined. Este sanitizador elimina
   * undefined de forma recursiva en objetos y arreglos antes de persistir.
   */
  private sanitizeUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== undefined)
        .map((item) => this.sanitizeUndefined(item)) as unknown as T;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, this.sanitizeUndefined(v)]);

      return Object.fromEntries(entries) as T;
    }

    return value;
  }

  list<T>(path: string): Observable<T[]> {
    /**
     * Uso directo del SDK de Firestore para evitar NG0203 en Angular 20
     * reportado con APIs compat (snapshotChanges/collection).
     */
    return new Observable<T[]>((subscriber) => {
      const unsubscribe = this.firestore.firestore.collection(path).onSnapshot(
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as T),
          })) as T[];
          subscriber.next(data);
        },
        (error) => subscriber.error(error),
      );

      return () => unsubscribe();
    });
  }

  /**
   * Lectura one-shot sin compat stream para evitar NG0203 en validaciones
   * que se ejecutan fuera del ciclo típico de render/reactividad.
   */
  async listOnce<T>(path: string): Promise<T[]> {
    const snapshot = await this.firestore.firestore.collection(path).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as T) } as T));
  }

  getById<T>(path: string, id: string): Observable<T> {
    /**
     * Se usa lectura directa del SDK nativo para evitar fallos NG0203
     * reportados en algunos flujos con snapshotChanges() en compat.
     */
    return from(this.firestore.firestore.doc(`${path}/${id}`).get())
      .pipe(
        map((snapshot) => {
          const data = snapshot.data();
          return { id: snapshot.id, ...(data as T) } as T;
        }),
      );
  }

  create<T>(path: string, payload: T): Promise<string> {
    const cleanPayload = this.sanitizeUndefined(payload);
    return this.firestore.firestore
      .collection(path)
      .add(cleanPayload as unknown as Record<string, unknown>)
      .then((ref) => ref.id);
  }

  update<T>(path: string, id: string, payload: Partial<T>): Promise<void> {
    const cleanPayload = this.sanitizeUndefined(payload);
    return this.firestore.firestore
      .doc(`${path}/${id}`)
      .update(cleanPayload as Record<string, unknown>)
      .then(() => void 0);
  }

  remove(path: string, id: string): Promise<void> {
    return this.firestore.firestore
      .doc(`${path}/${id}`)
      .delete()
      .then(() => void 0);
  }
}
