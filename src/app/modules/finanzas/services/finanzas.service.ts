import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { FiltroPeriodoFinanciero, MovimientoFinanciero } from '../models/movimiento-financiero.model';
import { filtrarPorPeriodo } from '../utils/finanzas-filter.utils';

@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private readonly collectionPath = 'movimientosFinancieros';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<MovimientoFinanciero[]> {
    return this.firestoreBase.list<MovimientoFinanciero>(this.collectionPath);
  }

  create(payload: MovimientoFinanciero): Promise<string> {
    return this.firestoreBase.create<MovimientoFinanciero>(this.collectionPath, payload);
  }

  update(id: string, payload: Partial<MovimientoFinanciero>): Promise<void> {
    return this.firestoreBase.update<MovimientoFinanciero>(this.collectionPath, id, payload);
  }

  byPeriodo(periodo: FiltroPeriodoFinanciero): Observable<MovimientoFinanciero[]> {
    return this.list().pipe(map((items) => filtrarPorPeriodo(items, periodo)));
  }

  byRango(fechaDesde: string, fechaHasta: string): Observable<MovimientoFinanciero[]> {
    const desde = this.parseInputDate(fechaDesde, false);
    const hasta = this.parseInputDate(fechaHasta, true);

    return this.list().pipe(map((items) => items.filter((item) => {
      const fecha = this.parseMovimientoDate(item.fecha);
      if (!fecha) return false;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    })));
  }

  private parseInputDate(value: string, endOfDate: boolean): Date | null {
    if (!value) return null;
    const parsed = new Date(`${value}T${endOfDate ? '23:59:59.999' : '00:00:00.000'}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseMovimientoDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof (value as any)?.toDate === 'function') {
      const parsed = (value as any).toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const raw = String(value).trim();
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
