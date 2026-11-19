import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { Observable } from 'rxjs';
import { Factura } from '../models/factura.model';
import { DesgloseEfectivo, normalizarDesgloseEfectivo, totalDesgloseEfectivo, TurnoCaja, TurnoTotales } from '../models/turno-caja.model';
import { desglosarPagosFactura, normalizarMetodoPagoFactura } from '../helpers/pagos-factura.helper';

@Injectable({ providedIn: 'root' })
export class TurnosCajaService {
  private readonly collectionPath = 'turnosCaja';
  private readonly facturasPath = 'facturas';

  constructor(private readonly afs: AngularFirestore) {}

  list(): Observable<TurnoCaja[]> {
    // Se usa el SDK directo para mantener la suscripción fuera de las APIs
    // compat que pueden fallar con NG0203 al entrar a Finanzas por lazy loading.
    return new Observable<TurnoCaja[]>((subscriber) => {
      const unsubscribe = this.afs.firestore.collection(this.collectionPath).onSnapshot(
        (snapshot) => {
          subscriber.next(snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as TurnoCaja),
          })));
        },
        (error) => subscriber.error(error),
      );

      return () => unsubscribe();
    });
  }

  async getTurnoAbierto(usuarioId: string, cajaId?: string): Promise<TurnoCaja | null> {
    if (!usuarioId) return null;
    const db = this.afs.firestore;
    let query: firebase.firestore.Query = db.collection(this.collectionPath)
      .where('estado', '==', 'abierto')
      .where('usuarioId', '==', usuarioId);

    if (cajaId) {
      query = query.where('cajaId', '==', cajaId);
    }

    const snap = await query.orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...(doc.data() as TurnoCaja) };
  }

  async abrirTurno(params: {
    cajaId: string;
    cajaNombre: string;
    usuarioId: string;
    usuarioNombre: string;
    montoInicial: number;
    observacionApertura?: string;
  }): Promise<TurnoCaja> {
    const existing = await this.getTurnoAbierto(params.usuarioId, params.cajaId);
    if (existing) return existing;

    const db = this.afs.firestore;
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const numeroTurno = this.generarNumeroTurno();
    const docRef = db.collection(this.collectionPath).doc();
    const payload: TurnoCaja = {
      numeroTurno,
      cajaId: params.cajaId,
      cajaNombre: params.cajaNombre,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fechaApertura: now,
      fechaCierre: null,
      montoInicial: Number(params.montoInicial || 0),
      efectivoEsperado: 0,
      fondoInicialIncluidoEnConteo: false,
      efectivoContado: null,
      diferencia: null,
      totalVentas: 0,
      totalEfectivo: 0,
      totalTarjeta: 0,
      totalTransferencia: 0,
      totalCredito: 0,
      cantidadFacturas: 0,
      estado: 'abierto',
      observacionApertura: params.observacionApertura || '',
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(payload as any);
    return { id: docRef.id, ...payload };
  }

  async cerrarTurno(turno: TurnoCaja, efectivoContado: number, observacionCierre?: string, desgloseEfectivo?: DesgloseEfectivo[], fondoInicialIncluidoEnConteo = false): Promise<TurnoCaja> {
    if (!turno?.id || turno.estado !== 'abierto') throw new Error('SHIFT_NOT_OPEN');
    const totales = await this.calcularTotalesTurno(turno.id);
    const montoInicial = Number(turno.montoInicial || 0);
    const esperado = Number(((fondoInicialIncluidoEnConteo ? montoInicial : 0) + totales.totalEfectivo).toFixed(2));
    const desglose = desgloseEfectivo ? normalizarDesgloseEfectivo(desgloseEfectivo) : undefined;
    const contado = desglose ? totalDesgloseEfectivo(desglose) : Number(efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) throw new Error('INVALID_CASH_COUNT');
    const diferencia = Number((contado - esperado).toFixed(2));
    const fechaCierre = firebase.firestore.Timestamp.now();

    await this.afs.firestore.collection(this.collectionPath).doc(turno.id).update({
      fechaCierre,
      estado: 'cerrado',
      efectivoEsperado: esperado,
      efectivoContado: contado,
      fondoInicialIncluidoEnConteo,
      diferencia,
      totalVentas: totales.totalVentas,
      totalEfectivo: totales.totalEfectivo,
      totalTarjeta: totales.totalTarjeta,
      totalTransferencia: totales.totalTransferencia,
      totalCredito: totales.totalCredito,
      cantidadFacturas: totales.cantidadFacturas,
      observacionCierre: observacionCierre || '',
      ...(desglose ? { desgloseEfectivo: desglose } : {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { ...turno, fechaCierre, id: turno.id, ...totales, estado: 'cerrado', efectivoEsperado: esperado,
      efectivoContado: contado, fondoInicialIncluidoEnConteo, diferencia, observacionCierre: observacionCierre || '',
      ...(desglose ? { desgloseEfectivo: desglose } : {}) } as TurnoCaja;
  }

  async calcularTotalesTurno(turnoId: string): Promise<TurnoTotales> {
    if (!turnoId) {
      return this.emptyTotales();
    }
    const snap = await this.afs.firestore.collection(this.facturasPath)
      .where('turnoId', '==', turnoId)
      .where('estado', 'in', ['emitida', 'pagada'])
      .get();

    const acc = this.emptyTotales();
    snap.docs.forEach((doc) => {
      const factura = doc.data() as Factura;
      if (factura.estado === 'anulada') return;
      const total = Number(factura.total || 0);
      const pagos = desglosarPagosFactura(factura);

      acc.totalVentas = Number((acc.totalVentas + total).toFixed(2));
      acc.cantidadFacturas += 1;
      acc.totalEfectivo = Number((acc.totalEfectivo + pagos.efectivo).toFixed(2));
      acc.totalTarjeta = Number((acc.totalTarjeta + pagos.tarjeta).toFixed(2));
      acc.totalTransferencia = Number((acc.totalTransferencia + pagos.transferencia).toFixed(2));
      acc.totalCredito = Number((acc.totalCredito + pagos.credito).toFixed(2));
    });
    return acc;
  }

  normalizarMetodoPago(value: unknown): 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro' {
    return normalizarMetodoPagoFactura(value);
  }

  private generarNumeroTurno(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `TRN-${yyyy}${mm}${dd}-${hh}${min}`;
  }

  private emptyTotales(): TurnoTotales {
    return {
      totalVentas: 0,
      totalEfectivo: 0,
      totalTarjeta: 0,
      totalTransferencia: 0,
      totalCredito: 0,
      cantidadFacturas: 0,
    };
  }
}
