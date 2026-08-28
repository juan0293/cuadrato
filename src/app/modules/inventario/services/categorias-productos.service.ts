import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { CategoriaProducto } from '../models/categoria-producto.model';

@Injectable({ providedIn: 'root' })
export class CategoriasProductosService {
  private readonly collectionPath = 'categoriasProductos';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  getCategorias(): Observable<CategoriaProducto[]> {
    return this.firestoreBase.list<CategoriaProducto>(this.collectionPath).pipe(
      map((items) => [...items].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre))),
    );
  }

  getCategoriasActivas(): Observable<CategoriaProducto[]> {
    return this.getCategorias().pipe(map((items) => items.filter((item) => item.activo)));
  }

  createCategoria(data: CategoriaProducto): Promise<string> {
    return this.firestoreBase.create<CategoriaProducto>(this.collectionPath, data);
  }

  updateCategoria(id: string, data: Partial<CategoriaProducto>): Promise<void> {
    return this.firestoreBase.update<CategoriaProducto>(this.collectionPath, id, data);
  }

  activarCategoria(id: string): Promise<void> {
    return this.updateCategoria(id, { activo: true, fechaActualizacion: new Date().toISOString() });
  }

  inactivarCategoria(id: string): Promise<void> {
    return this.updateCategoria(id, { activo: false, fechaActualizacion: new Date().toISOString() });
  }

  async existsCategoriaNombre(nombre: string, excludeId?: string): Promise<boolean> {
    const items = await this.firestoreBase.listOnce<CategoriaProducto>(this.collectionPath);
    const normalized = nombre.trim().toLowerCase();
    return items.some((item) => item.id !== excludeId && item.nombre.trim().toLowerCase() === normalized);
  }
}
