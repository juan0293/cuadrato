import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { UnidadMedida } from '../models/unidad-medida.model';

@Injectable({ providedIn: 'root' })
export class UnidadesMedidaService {
  private readonly collectionPath = 'unidadesMedida';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  getUnidades(): Observable<UnidadMedida[]> {
    return this.firestoreBase.list<UnidadMedida>(this.collectionPath).pipe(
      map((items) => [...items].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre))),
    );
  }

  getUnidadesActivas(): Observable<UnidadMedida[]> {
    return this.getUnidades().pipe(map((items) => items.filter((item) => item.activo)));
  }

  createUnidad(data: UnidadMedida): Promise<string> {
    return this.firestoreBase.create<UnidadMedida>(this.collectionPath, data);
  }

  updateUnidad(id: string, data: Partial<UnidadMedida>): Promise<void> {
    return this.firestoreBase.update<UnidadMedida>(this.collectionPath, id, data);
  }

  activarUnidad(id: string): Promise<void> {
    return this.updateUnidad(id, { activo: true, fechaActualizacion: new Date().toISOString() });
  }

  inactivarUnidad(id: string): Promise<void> {
    return this.updateUnidad(id, { activo: false, fechaActualizacion: new Date().toISOString() });
  }

  async existsUnidadCodigo(codigo: string, excludeId?: string): Promise<boolean> {
    const items = await this.firestoreBase.listOnce<UnidadMedida>(this.collectionPath);
    const normalized = codigo.trim().toLowerCase();
    return items.some((item) => item.id !== excludeId && item.codigo.trim().toLowerCase() === normalized);
  }

  async existsUnidadNombre(nombre: string, excludeId?: string): Promise<boolean> {
    const items = await this.firestoreBase.listOnce<UnidadMedida>(this.collectionPath);
    const normalized = nombre.trim().toLowerCase();
    return items.some((item) => item.id !== excludeId && item.nombre.trim().toLowerCase() === normalized);
  }
}
