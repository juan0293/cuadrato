import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';

export interface CategoriaFinanciera {
  id?: string;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  estado: 'activo' | 'inactivo';
  createdAt: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class CategoriasFinancierasService {
  private readonly collectionPath = 'categoriasFinancieras';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<CategoriaFinanciera[]> {
    return this.firestoreBase.list<CategoriaFinanciera>(this.collectionPath).pipe(
      map((items) => [...(items || [])].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')))),
    );
  }

  create(payload: CategoriaFinanciera): Promise<string> {
    return this.firestoreBase.create<CategoriaFinanciera>(this.collectionPath, {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  update(id: string, payload: Partial<CategoriaFinanciera>): Promise<void> {
    return this.firestoreBase.update<CategoriaFinanciera>(this.collectionPath, id, {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
  }

  async existsNombre(nombre: string, excludeId?: string): Promise<boolean> {
    const normalized = String(nombre || '').trim().toLowerCase();
    if (!normalized) return false;
    const items = await this.firestoreBase.listOnce<CategoriaFinanciera>(this.collectionPath);
    return items.some((item) => item.id !== excludeId && String(item.nombre || '').trim().toLowerCase() === normalized);
  }
}
