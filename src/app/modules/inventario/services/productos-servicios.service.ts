import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { ProductoServicio } from '../models/producto-servicio.model';
import { getNextSequentialCode } from '../utils/code-generator.utils';

@Injectable({ providedIn: 'root' })
export class ProductosServiciosService {
  private readonly collectionPath = 'productosServicios';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<ProductoServicio[]> {
    return this.firestoreBase.list<ProductoServicio>(this.collectionPath);
  }

  getProductosServicios(): Observable<ProductoServicio[]> {
    return this.list();
  }

  getById(id: string): Observable<ProductoServicio> {
    return this.firestoreBase.getById<ProductoServicio>(this.collectionPath, id);
  }

  create(payload: ProductoServicio): Promise<string> {
    return this.firestoreBase.create<ProductoServicio>(this.collectionPath, payload);
  }

  createProductoServicio(payload: ProductoServicio): Promise<string> {
    return this.create({
      ...payload,
      fechaCreacion: payload.fechaCreacion || new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  }

  update(id: string, payload: Partial<ProductoServicio>): Promise<void> {
    return this.firestoreBase.update<ProductoServicio>(this.collectionPath, id, payload);
  }

  updateProductoServicio(id: string, payload: Partial<ProductoServicio>): Promise<void> {
    return this.update(id, {
      ...payload,
      fechaActualizacion: new Date().toISOString(),
    });
  }

  activarProductoServicio(id: string): Promise<void> {
    return this.updateProductoServicio(id, { activo: true });
  }

  inactivarProductoServicio(id: string): Promise<void> {
    return this.updateProductoServicio(id, { activo: false });
  }

  softDeleteProductoServicio(id: string): Promise<void> {
    return this.inactivarProductoServicio(id);
  }

  deleteProductoServicio(id: string): Promise<void> {
    return this.firestoreBase.remove(this.collectionPath, id);
  }

  async getNextCodigoInterno(): Promise<string> {
    const items = await this.firestoreBase.listOnce<ProductoServicio>(this.collectionPath);
    return getNextSequentialCode(items.map((item) => item.codigoInterno || ''));
  }

  async existsCodigoInterno(codigo: string, excludeId?: string): Promise<boolean> {
    const normalized = codigo.trim().toLowerCase();
    const items = await this.firestoreBase.listOnce<ProductoServicio>(this.collectionPath);
    return items.some((item) => item.id !== excludeId && String(item.codigoInterno || '').trim().toLowerCase() === normalized);
  }
}
