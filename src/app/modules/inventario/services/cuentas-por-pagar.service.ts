import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Compra } from '../models/compra.model';
import { CuentaPorPagar, PagoCuentaPorPagar } from '../models/cuenta-por-pagar.model';
import { calcularBalancePendiente, resolverEstadoCuentaPorPagar } from '../utils/cuentas-por-pagar.utils';

@Injectable({ providedIn: 'root' })
export class CuentasPorPagarService {
  private readonly collectionPath = 'cuentasPorPagar';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<CuentaPorPagar[]> {
    return this.firestoreBase.list<CuentaPorPagar>(this.collectionPath);
  }

  listEnriquecida(): Observable<CuentaPorPagar[]> {
    return this.list().pipe(
      map((items) =>
        items
          .map((item) => ({
            ...item,
            estado: resolverEstadoCuentaPorPagar(item.montoOriginal, item.montoPagado, item.fechaVencimiento),
            balancePendiente: calcularBalancePendiente(item.montoOriginal, item.montoPagado),
          }))
          .sort((a, b) => String(b.fechaCreacion).localeCompare(String(a.fechaCreacion))),
      ),
    );
  }

  getById(id: string): Observable<CuentaPorPagar> {
    return this.firestoreBase.getById<CuentaPorPagar>(this.collectionPath, id).pipe(
      map((item) => ({
        ...item,
        estado: resolverEstadoCuentaPorPagar(item.montoOriginal, item.montoPagado, item.fechaVencimiento),
        balancePendiente: calcularBalancePendiente(item.montoOriginal, item.montoPagado),
      })),
    );
  }

  create(payload: CuentaPorPagar): Promise<string> {
    return this.firestoreBase.create<CuentaPorPagar>(this.collectionPath, payload);
  }

  update(id: string, payload: Partial<CuentaPorPagar>): Promise<void> {
    return this.firestoreBase.update<CuentaPorPagar>(this.collectionPath, id, payload);
  }

  listPagos(cuentaId: string): Observable<PagoCuentaPorPagar[]> {
    return this.firestoreBase.list<PagoCuentaPorPagar>(`${this.collectionPath}/${cuentaId}/pagos`);
  }

  createPago(cuentaId: string, payload: PagoCuentaPorPagar): Promise<string> {
    return this.firestoreBase.create<PagoCuentaPorPagar>(`${this.collectionPath}/${cuentaId}/pagos`, payload);
  }

  /**
   * Genera CxP desde una compra a crédito confirmada.
   */
  async createFromCompra(compra: Compra): Promise<string> {
    const fechaVencimiento = compra.fechaVencimiento || compra.fechaEmision;
    const payload: CuentaPorPagar = {
      proveedorId: compra.proveedorId,
      proveedorNombre: compra.proveedorNombre,
      compraId: compra.id as string,
      numeroFactura: compra.numeroFactura,
      montoOriginal: compra.total,
      montoPagado: 0,
      balancePendiente: compra.total,
      fechaEmision: compra.fechaEmision,
      fechaVencimiento,
      estado: resolverEstadoCuentaPorPagar(compra.total, 0, fechaVencimiento),
      moneda: compra.moneda,
      creadoPor: compra.creadoPor,
      fechaCreacion: new Date().toISOString(),
    };

    return this.create(payload);
  }

  /**
   * Registra abono y recalcula estado/balance para mantener trazabilidad financiera.
   */
  async registrarAbono(id: string, montoAbono: number): Promise<void> {
    if (!(montoAbono > 0)) {
      throw new Error('INVALID_PAYMENT_AMOUNT');
    }

    const current = await new Promise<CuentaPorPagar>((resolve, reject) => {
      this.getById(id).subscribe({ next: resolve, error: reject });
    });

    const nuevoPagado = Number((current.montoPagado + montoAbono).toFixed(2));
    const balancePendiente = calcularBalancePendiente(current.montoOriginal, nuevoPagado);
    const estado = resolverEstadoCuentaPorPagar(current.montoOriginal, nuevoPagado, current.fechaVencimiento);

    await this.update(id, {
      montoPagado: nuevoPagado,
      balancePendiente,
      estado,
    });
  }
}
