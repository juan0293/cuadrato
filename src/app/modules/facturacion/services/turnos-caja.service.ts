import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { Observable } from 'rxjs';
import { Factura } from '../models/factura.model';
import { TurnoCaja, TurnoTotales } from '../models/turno-caja.model';

@Injectable({ providedIn: 'root' })
export class TurnosCajaService {
  private readonly collectionPath = 'turnosCaja';
  private readonly facturasPath = 'facturas';

  constructor(private readonly afs: AngularFirestore) {}

  list(): Observable<TurnoCaja[]> {
    return this.afs.collection<TurnoCaja>(this.collectionPath).valueChanges({ idField: 'id' });
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
      efectivoEsperado: Number(params.montoInicial || 0),
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

  async cerrarTurno(turno: TurnoCaja, efectivoContado: number, observacionCierre?: string): Promise<void> {
    if (!turno?.id || turno.estado !== 'abierto') return;
    const totales = await this.calcularTotalesTurno(turno.id);
    const montoInicial = Number(turno.montoInicial || 0);
    const esperado = Number((montoInicial + totales.totalEfectivo).toFixed(2));
    const contado = Number(efectivoContado || 0);
    const diferencia = Number((contado - esperado).toFixed(2));

    await this.afs.firestore.collection(this.collectionPath).doc(turno.id).update({
      fechaCierre: firebase.firestore.FieldValue.serverTimestamp(),
      estado: 'cerrado',
      efectivoEsperado: esperado,
      efectivoContado: contado,
      diferencia,
      totalVentas: totales.totalVentas,
      totalEfectivo: totales.totalEfectivo,
      totalTarjeta: totales.totalTarjeta,
      totalTransferencia: totales.totalTransferencia,
      totalCredito: totales.totalCredito,
      cantidadFacturas: totales.cantidadFacturas,
      observacionCierre: observacionCierre || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
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
      const metodo = this.normalizarMetodoPago(factura.formaPago);

      acc.totalVentas = Number((acc.totalVentas + total).toFixed(2));
      acc.cantidadFacturas += 1;
      if (metodo === 'efectivo') acc.totalEfectivo = Number((acc.totalEfectivo + total).toFixed(2));
      if (metodo === 'tarjeta') acc.totalTarjeta = Number((acc.totalTarjeta + total).toFixed(2));
      if (metodo === 'transferencia') acc.totalTransferencia = Number((acc.totalTransferencia + total).toFixed(2));
      if (metodo === 'credito') acc.totalCredito = Number((acc.totalCredito + total).toFixed(2));
    });
    return acc;
  }

  normalizarMetodoPago(value: unknown): 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro' {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!normalized) return 'otro';
    if (['efectivo', 'cash'].includes(normalized)) return 'efectivo';
    if (['tarjeta', 'card', 'credito-debito', 'debito', 'credito'].includes(normalized)) return 'tarjeta';
    if (['transferencia', 'transfer'].includes(normalized)) return 'transferencia';
    if (['credito', 'a credito'].includes(normalized)) return 'credito';
    return 'otro';
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
