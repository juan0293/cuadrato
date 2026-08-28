import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Cita } from '../models/cita.model';
import { hasAppointmentConflict } from '../utils/agenda-validation.utils';

@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly collectionPath = 'citas';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<Cita[]> {
    return this.firestoreBase.list<Cita>(this.collectionPath);
  }

  byDate(fecha: string): Observable<Cita[]> {
    return this.list().pipe(map((items) => items.filter((item) => item.fecha === fecha)));
  }

  byArtist(artistaId: string): Observable<Cita[]> {
    return this.list().pipe(map((items) => items.filter((item) => item.artistaId === artistaId)));
  }

  getCitas(): Observable<Cita[]> {
    return this.list();
  }

  getCitasPorFecha(fecha: string): Observable<Cita[]> {
    return this.byDate(fecha);
  }

  /**
   * Valida solapamiento antes de persistir la cita para bloquear
   * doble reserva operativa del mismo artista.
   */
  async create(payload: Cita): Promise<string> {
    const existing = await this.snapshot();
    if (hasAppointmentConflict(payload, existing)) {
      throw new Error('CONFLICT_SCHEDULE');
    }
    return this.firestoreBase.create<Cita>(this.collectionPath, payload);
  }

  async update(id: string, payload: Partial<Cita>): Promise<void> {
    const current = await this.snapshot();
    const target = current.find((item) => item.id === id);
    if (!target) throw new Error('APPOINTMENT_NOT_FOUND');

    const merged = { ...target, ...payload } as Cita;
    if (hasAppointmentConflict(merged, current)) {
      throw new Error('CONFLICT_SCHEDULE');
    }

    await this.firestoreBase.update<Cita>(this.collectionPath, id, payload);
  }

  updateCita(id: string, payload: Partial<Cita>): Promise<void> {
    return this.update(id, payload);
  }

  createCita(payload: Cita): Promise<string> {
    return this.create(payload);
  }

  async moverCita(id: string, payload: Pick<Cita, 'fecha' | 'horaInicio' | 'horaFin'>): Promise<void> {
    await this.update(id, {
      ...payload,
      estado: 'reprogramada',
      actualizadoEn: new Date().toISOString(),
    });
  }

  async anularCita(id: string, motivoAnulacion?: string): Promise<void> {
    await this.update(id, {
      estado: 'anulada',
      motivoAnulacion: motivoAnulacion?.trim() || undefined,
      anuladaEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });
  }

  async marcarAtendida(id: string): Promise<void> {
    await this.update(id, {
      estado: 'atendida',
      actualizadoEn: new Date().toISOString(),
    });
  }

  private async snapshot(): Promise<Cita[]> {
    return await new Promise<Cita[]>((resolve) => {
      this.list().subscribe({
        next: (items) => resolve(items),
        error: () => resolve([]),
      });
    });
  }
}
