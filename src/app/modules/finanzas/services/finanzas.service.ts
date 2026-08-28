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
}
