import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Cliente } from '../models/cliente.model';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly collectionPath = 'clientes';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  getClientes(): Observable<Cliente[]> {
    return this.firestoreBase.list<Cliente>(this.collectionPath).pipe(
      map((items) => [...items].sort((a, b) => String(a.nombreCompleto || '').localeCompare(String(b.nombreCompleto || '')))),
    );
  }

  searchClientes(query: string): Observable<Cliente[]> {
    const q = query.trim().toLowerCase();
    return this.getClientes().pipe(
      map((items) => {
        if (!q) return items;
        return items.filter((item) =>
          [item.nombreCompleto, item.telefono, item.correo]
            .some((v) => String(v || '').toLowerCase().includes(q)));
      }),
    );
  }

  async createCliente(payload: Cliente): Promise<string> {
    return this.firestoreBase.create<Cliente>(this.collectionPath, {
      ...payload,
      activo: payload.activo ?? true,
      creadoEn: payload.creadoEn || new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });
  }

  async existsClienteRncCedula(rncCedula: string, excludeId?: string): Promise<boolean> {
    const normalized = String(rncCedula || '').trim().toLowerCase();
    if (!normalized) return false;
    const items = await this.firestoreBase.listOnce<Cliente>(this.collectionPath);
    return items.some((item) => item.id !== excludeId && String(item.rncCedula || '').trim().toLowerCase() === normalized);
  }

  async existsClienteTelefono(telefono: string, excludeId?: string): Promise<boolean> {
    const normalized = String(telefono || '').replace(/\s+/g, '').toLowerCase();
    if (!normalized) return false;
    const items = await this.firestoreBase.listOnce<Cliente>(this.collectionPath);
    return items.some((item) => item.id !== excludeId && String(item.telefono || '').replace(/\s+/g, '').toLowerCase() === normalized);
  }

  updateCliente(id: string, payload: Partial<Cliente>): Promise<void> {
    return this.firestoreBase.update<Cliente>(this.collectionPath, id, {
      ...payload,
      actualizadoEn: new Date().toISOString(),
    });
  }
}
