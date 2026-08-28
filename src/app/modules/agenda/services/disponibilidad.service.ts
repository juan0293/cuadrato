import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { DisponibilidadArtista } from '../models/disponibilidad-artista.model';

@Injectable({ providedIn: 'root' })
export class DisponibilidadService {
  private readonly collectionPath = 'disponibilidadArtistas';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<DisponibilidadArtista[]> {
    return this.firestoreBase.list<DisponibilidadArtista>(this.collectionPath);
  }

  byArtist(artistaId: string): Observable<DisponibilidadArtista[]> {
    return this.list().pipe(map((items) => items.filter((item) => item.artistaId === artistaId)));
  }

  create(payload: DisponibilidadArtista): Promise<string> {
    return this.firestoreBase.create<DisponibilidadArtista>(this.collectionPath, payload);
  }

  update(id: string, payload: Partial<DisponibilidadArtista>): Promise<void> {
    return this.firestoreBase.update<DisponibilidadArtista>(this.collectionPath, id, payload);
  }
}
