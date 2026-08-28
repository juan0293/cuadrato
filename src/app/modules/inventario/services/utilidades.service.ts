import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Utilidad } from '../models/utilidad.model';

@Injectable({ providedIn: 'root' })
export class UtilidadesService {
  private readonly collectionPath = 'utilidades';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  getUtilidades(): Observable<Utilidad[]> {
    return this.firestoreBase.list<Utilidad>(this.collectionPath).pipe(
      map((items) => [...items].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.porcentaje - b.porcentaje)),
    );
  }

  getUtilidadesActivas(): Observable<Utilidad[]> {
    return this.getUtilidades().pipe(map((items) => items.filter((item) => item.activo)));
  }

  createUtilidad(data: Utilidad): Promise<string> {
    return this.firestoreBase.create<Utilidad>(this.collectionPath, data);
  }

  updateUtilidad(id: string, data: Partial<Utilidad>): Promise<void> {
    return this.firestoreBase.update<Utilidad>(this.collectionPath, id, data);
  }

  activarUtilidad(id: string): Promise<void> {
    return this.updateUtilidad(id, { activo: true, fechaActualizacion: new Date().toISOString() });
  }

  inactivarUtilidad(id: string): Promise<void> {
    return this.updateUtilidad(id, { activo: false, fechaActualizacion: new Date().toISOString() });
  }

  async existsUtilidadNombre(nombre: string, excludeId?: string): Promise<boolean> {
    const items = await this.firestoreBase.listOnce<Utilidad>(this.collectionPath);
    const normalized = nombre.trim().toLowerCase();
    return items.some((item) => item.id !== excludeId && item.nombre.trim().toLowerCase() === normalized);
  }
}
