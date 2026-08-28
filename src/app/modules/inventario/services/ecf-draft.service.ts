import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Compra } from '../models/compra.model';
import { EcfLineDraft } from '../models/ecf-line-draft.model';
import { ComprasService } from './compras.service';
import { toEcfLineDraftList, validateEcfDraftBatch } from '../utils/fiscal-mapper.utils';

export interface EcfDraftPreview {
  compra: Compra;
  lines: EcfLineDraft[];
  validation: { line: number; errors: string[] }[];
}

@Injectable({ providedIn: 'root' })
export class EcfDraftService {
  constructor(private readonly comprasService: ComprasService) {}

  getPreviewByCompraId(compraId: string): Observable<EcfDraftPreview> {
    return this.comprasService.getById(compraId).pipe(
      map((compra) => {
        const lines = toEcfLineDraftList(compra.items || []);
        const validation = validateEcfDraftBatch(lines);

        return { compra, lines, validation };
      }),
    );
  }
}
