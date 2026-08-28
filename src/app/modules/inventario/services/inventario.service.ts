import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Insumo } from '../models/insumo.model';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly collectionPath = 'insumos';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<Insumo[]> {
    return this.firestoreBase.list<Insumo>(this.collectionPath);
  }

  getById(id: string): Observable<Insumo> {
    return this.firestoreBase.getById<Insumo>(this.collectionPath, id);
  }

  create(payload: Insumo): Promise<string> {
    return this.firestoreBase.create<Insumo>(this.collectionPath, payload);
  }

  update(id: string, payload: Partial<Insumo>): Promise<void> {
    return this.firestoreBase.update<Insumo>(this.collectionPath, id, payload);
  }

  /**
   * Inactivación lógica para preservar trazabilidad operativa.
   */
  setActiveStatus(id: string, active: boolean): Promise<void> {
    return this.update(id, { activo: active });
  }

  /**
   * Eliminación física solo para limpieza administrativa explícita.
   */
  remove(id: string): Promise<void> {
    return this.firestoreBase.remove(this.collectionPath, id);
  }
}
