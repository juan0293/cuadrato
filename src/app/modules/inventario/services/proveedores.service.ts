import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Proveedor } from '../models/proveedor.model';

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private readonly collectionPath = 'proveedores';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  getProveedores(): Observable<Proveedor[]> {
    return this.firestoreBase.list<Proveedor>(this.collectionPath).pipe(
      map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))),
    );
  }

  getProveedoresActivos(): Observable<Proveedor[]> {
    return this.getProveedores().pipe(map((items) => items.filter((item) => item.activo)));
  }

  getProveedorById(id: string): Observable<Proveedor | undefined> {
    return this.getProveedores().pipe(map((items) => items.find((item) => item.id === id)));
  }

  createProveedor(data: Proveedor): Promise<string> {
    return this.firestoreBase.create<Proveedor>(this.collectionPath, data);
  }

  updateProveedor(id: string, data: Partial<Proveedor>): Promise<void> {
    return this.firestoreBase.update<Proveedor>(this.collectionPath, id, data);
  }

  activarProveedor(id: string): Promise<void> {
    return this.updateProveedor(id, { activo: true, fechaActualizacion: new Date().toISOString() });
  }

  inactivarProveedor(id: string): Promise<void> {
    return this.updateProveedor(id, { activo: false, fechaActualizacion: new Date().toISOString() });
  }

  async existsProveedorNombre(nombre: string, excludeId?: string): Promise<boolean> {
    const items = await this.firestoreBase.listOnce<Proveedor>(this.collectionPath);
    const normalized = nombre.trim().toLowerCase();
    return items.some((item) => item.id !== excludeId && String(item.nombre || '').trim().toLowerCase() === normalized);
  }

  async existsProveedorRnc(rnc: string, excludeId?: string): Promise<boolean> {
    const value = rnc.trim().toLowerCase();
    if (!value) return false;
    const items = await this.firestoreBase.listOnce<Proveedor>(this.collectionPath);
    return items.some((item) => item.id !== excludeId && String(item.rnc || '').trim().toLowerCase() === value);
  }
}
