import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';
import { CuentaAbierta, CuentaAbiertaConsumo } from '../models/cuenta-abierta.model';
import { calcularCuenta, validarCuentaAbierta } from '../helpers/cuenta-abierta.helper';

@Injectable({ providedIn: 'root' })
export class CuentasAbiertasService {
  constructor(private readonly afs: AngularFirestore) {}

  list(): Observable<CuentaAbierta[]> {
    return new Observable(subscriber => this.afs.firestore.collection('cuentasAbiertas')
      .where('estado', '==', 'abierta').onSnapshot(snapshot => subscriber.next(snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as CuentaAbierta))
        .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))), error => subscriber.error(error)));
  }

  async get(id: string): Promise<CuentaAbierta> {
    const doc = await this.afs.firestore.doc(`cuentasAbiertas/${id}`).get({ source: 'server' });
    if (!doc.exists) throw new Error('ACCOUNT_NOT_OPEN');
    return { ...doc.data(), id: doc.id } as CuentaAbierta;
  }

  async crear(consumo: CuentaAbiertaConsumo, uid: string, responsableNombre = 'Usuario de caja'): Promise<CuentaAbierta> {
    const ref = this.afs.firestore.collection('cuentasAbiertas').doc();
    const now = new Date().toISOString();
    const cuenta: CuentaAbierta = { ...calcularCuenta(consumo), id: ref.id, estado: 'abierta', version: 1,
      creadaEn: now, actualizadaEn: now, creadaPor: uid, creadaPorNombre: responsableNombre, actualizadaPor: uid };
    const batch = this.afs.firestore.batch();
    batch.set(ref, this.clean(cuenta));
    batch.set(ref.collection('eventos').doc(), { accion: 'apertura', version: 1, usuarioId: uid, fecha: now });
    await batch.commit();
    return cuenta;
  }

  async guardar(id: string, version: number, consumo: CuentaAbiertaConsumo, uid: string): Promise<CuentaAbierta> {
    const datos = calcularCuenta(consumo);
    const ref = this.afs.firestore.doc(`cuentasAbiertas/${id}`);
    return this.afs.firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const actual = snap.data() as CuentaAbierta | undefined;
      validarCuentaAbierta(actual, version);
      const update = { ...datos, version: version + 1, actualizadaPor: uid, actualizadaEn: new Date().toISOString() };
      tx.update(ref, this.clean(update));
      tx.set(ref.collection('eventos').doc(), { accion: 'edicion', version: version + 1, usuarioId: uid,
        fecha: update.actualizadaEn, totalAnterior: actual.total, totalNuevo: datos.total });
      return { ...actual, ...update, id };
    });
  }

  async cancelar(cuenta: CuentaAbierta, motivo: string, uid: string): Promise<void> {
    if (!motivo.trim()) throw new Error('ACCOUNT_REASON_REQUIRED');
    const ref = this.afs.firestore.doc(`cuentasAbiertas/${cuenta.id}`);
    await this.afs.firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      validarCuentaAbierta(snap.data() as CuentaAbierta | undefined, cuenta.version);
      const fecha = new Date().toISOString();
      tx.update(ref, { estado: 'cancelada', motivoCancelacion: motivo.trim(), version: cuenta.version + 1,
        actualizadaPor: uid, actualizadaEn: fecha });
      tx.set(ref.collection('eventos').doc(), { accion: 'cancelacion', motivo: motivo.trim(),
        version: cuenta.version + 1, usuarioId: uid, fecha });
    });
  }

  private clean<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
}
