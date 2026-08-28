import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Cita } from '../../agenda/models/cita.model';
import { CobroCuentaPorCobrar, CuentaPorCobrar } from '../models/cuenta-por-cobrar.model';
import { Factura } from '../models/factura.model';

@Injectable({ providedIn: 'root' })
export class CuentasPorCobrarService {
  private readonly collectionPath = 'cuentasPorCobrar';

  constructor(private readonly firestoreBase: FirestoreBaseService) {}

  list(): Observable<CuentaPorCobrar[]> {
    return this.firestoreBase.list<CuentaPorCobrar>(this.collectionPath);
  }

  listEnriquecida(): Observable<CuentaPorCobrar[]> {
    return this.list().pipe(
      map((items) =>
        (items || []).map((item) => {
          const montoOriginal = this.toNumber(item.montoOriginal);
          const montoPagado = this.toNumber(item.montoPagado);
          const balancePendiente = Number(Math.max(0, montoOriginal - montoPagado).toFixed(2));
          return {
            ...item,
            montoOriginal,
            montoPagado,
            balancePendiente,
            estado: balancePendiente <= 0 ? 'pagada' : (item.estado === 'anulada' ? 'anulada' : (montoPagado > 0 ? 'parcial' : 'pendiente')),
          } as CuentaPorCobrar;
        }).sort((a, b) => String(b.fechaCreacion || '').localeCompare(String(a.fechaCreacion || ''))),
      ),
    );
  }

  create(payload: CuentaPorCobrar): Promise<string> {
    return this.firestoreBase.create<CuentaPorCobrar>(this.collectionPath, payload);
  }

  update(id: string, payload: Partial<CuentaPorCobrar>): Promise<void> {
    return this.firestoreBase.update<CuentaPorCobrar>(this.collectionPath, id, payload);
  }

  listCobros(cuentaId: string): Observable<CobroCuentaPorCobrar[]> {
    return this.firestoreBase.list<CobroCuentaPorCobrar>(`${this.collectionPath}/${cuentaId}/cobros`);
  }

  createCobro(cuentaId: string, payload: CobroCuentaPorCobrar): Promise<string> {
    return this.firestoreBase.create<CobroCuentaPorCobrar>(`${this.collectionPath}/${cuentaId}/cobros`, payload);
  }

  async findByCitaId(citaId: string): Promise<CuentaPorCobrar | undefined> {
    if (!citaId) return undefined;
    const items = await this.firestoreBase.listOnce<CuentaPorCobrar>(this.collectionPath);
    return (items || []).find((item) => item.citaId === citaId && item.estado !== 'anulada');
  }

  async syncDesdeCita(params: {
    cita: Cita;
    factura: Factura;
    facturaId: string;
    userId: string;
    montoPagado: number;
    balancePendiente: number;
  }): Promise<string | null> {
    const { cita, factura, facturaId, userId } = params;
    if (!cita.id) return null;

    const montoPagado = this.toNumber(params.montoPagado);
    const balancePendiente = Number(Math.max(0, this.toNumber(params.balancePendiente)).toFixed(2));
    const totalCita = Number(Math.max(
      0,
      this.toNumber(cita.totalConItbis || 0) || this.toNumber(cita.precioEstimado || 0),
    ).toFixed(2));
    const now = new Date();
    const fechaVencimiento = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();
    const existing = await this.findByCitaId(cita.id);
    const estado = balancePendiente <= 0 ? 'pagada' : (montoPagado > 0 ? 'parcial' : 'pendiente');
    const metodoOrigen: CuentaPorCobrar['metodoOrigen'] = balancePendiente > 0 && montoPagado > 0
      ? 'abono'
      : (factura.formaPago === 'credito' ? 'credito' : 'mixto');

    const payload: CuentaPorCobrar = {
      facturaId,
      citaId: cita.id,
      clienteId: String(factura.clienteId || cita.clienteId || 'consumidor-final'),
      clienteNombre: String(factura.clienteNombre || cita.clienteNombre || 'Consumidor final'),
      clienteTelefono: factura.clienteTelefono || cita.clienteTelefono,
      clienteDocumento: factura.clienteRncCedula,
      numeroFactura: String(factura.numero || factura.numeroFactura || facturaId),
      fechaEmision: String(factura.fecha || now.toISOString()),
      fechaVencimiento: existing?.fechaVencimiento || fechaVencimiento,
      moneda: 'DOP',
      montoOriginal: totalCita > 0 ? totalCita : Number((montoPagado + balancePendiente).toFixed(2)),
      montoPagado,
      balancePendiente,
      estado,
      metodoOrigen,
      origen: 'cita',
      creadoPor: existing?.creadoPor || userId,
      fechaCreacion: existing?.fechaCreacion || now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (existing?.id) {
      await this.update(existing.id, payload);
      return existing.id;
    }

    if (balancePendiente <= 0) return null;
    return this.create(payload);
  }

  private toNumber(value: unknown): number {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }
}
