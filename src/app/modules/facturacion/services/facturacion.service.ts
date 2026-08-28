import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { MovimientoFinanciero } from '../../finanzas/models/movimiento-financiero.model';
import { FinanzasService } from '../../finanzas/services/finanzas.service';
import { AgendaService } from '../../agenda/services/agenda.service';
import { Factura } from '../models/factura.model';
import { FacturaItem } from '../models/factura-item.model';
import { generarNumeroFactura } from '../helpers/facturacion.helper';
import { CuentaPorCobrar } from '../models/cuenta-por-cobrar.model';

@Injectable({ providedIn: 'root' })
export class FacturacionService {
  private readonly collectionPath = 'facturas';
  private readonly stockMovementPath = 'movimientosInventario';
  private readonly productsPath = 'productosServicios';
  private readonly ncfSequencePath = 'facturacionSecuencias';

  constructor(
    private readonly firestoreBase: FirestoreBaseService,
    private readonly afs: AngularFirestore,
    private readonly finanzasService: FinanzasService,
    private readonly agendaService: AgendaService,
  ) {}

  list(): Observable<Factura[]> {
    return this.firestoreBase.list<Factura>(this.collectionPath);
  }

  getFacturas(): Observable<Factura[]> {
    return this.list();
  }

  getFacturaById(id: string): Observable<Factura | undefined> {
    return this.list().pipe(map((items) => items.find((item) => item.id === id)));
  }

  getFacturasPorFecha(fromIso: string, toIso: string): Observable<Factura[]> {
    return this.list().pipe(
      map((items) => items.filter((item) => {
        const d = new Date(item.fecha).getTime();
        return d >= new Date(fromIso).getTime() && d <= new Date(toIso).getTime();
      })),
    );
  }

  async getFacturasDelDiaPorEstado(estado: 'emitida' | 'borrador'): Promise<Factura[]> {
    const now = new Date();
    const inicioDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const finDia = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    const db = this.afs.firestore;
    const snapshot = await db.collection(this.collectionPath)
      .where('estado', '==', estado)
      .where('creadoEn', '>=', inicioDia)
      .where('creadoEn', '<=', finDia)
      .orderBy('creadoEn', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Factura) }));
  }

  getFacturasEmitidasHoy(): Promise<Factura[]> {
    return this.getFacturasDelDiaPorEstado('emitida');
  }

  getBorradoresHoy(): Promise<Factura[]> {
    return this.getFacturasDelDiaPorEstado('borrador');
  }

  async createFactura(payload: Omit<Factura, 'numero'>): Promise<string> {
    const sequence = await this.obtenerSecuenciaFactura();
    const numero = generarNumeroFactura(sequence);
    const now = new Date().toISOString();
    return this.firestoreBase.create<Factura>(this.collectionPath, {
      ...payload,
      numero,
      numeroFactura: payload.numeroFactura || numero,
      creadoEn: payload.creadoEn || now,
      actualizadoEn: now,
      estadoFiscal: payload.estadoFiscal || 'pendiente',
      preparadoParaECF: payload.preparadoParaECF ?? true,
    });
  }

  async crearFactura(payload: Omit<Factura, 'numero'>): Promise<string> {
    return this.createFactura(payload);
  }

  /**
   * Emisión fiscal/operativa en transacción atómica:
   * 1) valida stock en lote
   * 2) genera número interno + NCF secuencial por tipo
   * 3) descuenta inventario y crea movimientos
   * 4) crea factura emitida
   */
  async emitirFactura(payload: Omit<Factura, 'numero' | 'estado'>): Promise<string> {
    // TODO(Fase e-CF): reactivar validación fiscal estricta cuando se habilite comprobante.
    // this.validateFiscalCliente(payload);

    const db = this.afs.firestore;
    const now = new Date().toISOString();
    const facturaRef = db.collection(this.collectionPath).doc();
    const facturaId = facturaRef.id;

    await db.runTransaction(async (tx) => {
      // READ phase: Firestore exige completar todas las lecturas antes de escribir.
      const seqRef = db.collection(this.ncfSequencePath).doc('INTERNA_FACTURA');
      const seqSnap = await tx.get(seqRef);
      const numeroSecuencia = (seqSnap.exists ? Number((seqSnap.data() as any)?.ultimo || 0) : 0) + 1;
      const numero = generarNumeroFactura(numeroSecuencia);
      // const ncf = this.buildNcf(payload.tipoComprobante || 'B02', sequence);
      const ncf = '';

      const inventoryItems = (payload.items || []).filter((item) => !!item.productoServicioId && item.tipo === 'producto' && item.manejaInventario);
      const readBuffer: Array<{ item: FacturaItem; productRef: any; stockActual: number; stockNuevo: number }> = [];

      for (const item of inventoryItems) {
        const productRef = db.collection(this.productsPath).doc(item.productoServicioId as string);
        const productSnap = await tx.get(productRef);
        if (!productSnap.exists) throw new Error('PRODUCT_NOT_FOUND');
        const product = productSnap.data() as any;
        const stockActual = Number(product?.stockActual || 0);
        const qty = Number(item.cantidad || 0);
        if (qty > stockActual) throw new Error(`INSUFFICIENT_STOCK:${item.descripcion}`);
        const stockNuevo = Number((stockActual - qty).toFixed(2));
        readBuffer.push({ item, productRef, stockActual, stockNuevo });
      }

      // WRITE phase
      tx.set(seqRef, { ultimo: numeroSecuencia, actualizadoEn: now }, { merge: true });

      for (const row of readBuffer) {
        const qty = Number(row.item.cantidad || 0);
        tx.update(row.productRef, {
          stockActual: row.stockNuevo,
          fechaActualizacion: now,
        });

        const movRef = db.collection(this.stockMovementPath).doc();
        tx.set(movRef, {
          productoId: row.item.productoServicioId,
          productoNombre: row.item.descripcion,
          tipoMovimiento: 'salida_venta',
          cantidad: qty,
          costoUnitario: Number(row.item.costoUnitario || 0),
          costoTotal: Number((qty * Number(row.item.costoUnitario || 0)).toFixed(2)),
          referenciaTipo: 'factura',
          referenciaId: facturaId,
          motivo: `Salida por venta ${numero}`,
          stockAnterior: row.stockActual,
          stockNuevo: row.stockNuevo,
          creadoPor: payload.creadaPor,
          fecha: now,
        });
      }

      tx.set(facturaRef, this.sanitizeForFirestore({
        ...payload,
        id: facturaId,
        numero,
        numeroFactura: payload.numeroFactura || numero,
        ncf,
        estado: 'emitida',
        inventarioAfectado: true,
        preparadoParaECF: payload.preparadoParaECF ?? true,
        estadoFiscal: payload.estadoFiscal || 'pendiente',
        creadoEn: payload.creadoEn || now,
        actualizadoEn: now,
      }));
    });

    const factura = await this.getFacturaSnapshot(facturaId);
    if (factura) {
      await this.registrarIngresoFinanciero(factura, facturaId);
      if (factura.citaId) {
        await this.agendaService.updateCita(factura.citaId, {
          estado: 'atendida',
          observacion: `Facturada ${factura.numero}`.trim(),
        } as any);
      }
    }

    return facturaId;
  }

  /**
   * Emite una factura existente en borrador, aplicando el mismo flujo
   * transaccional de inventario y numeración interna.
   */
  async emitirFacturaBorrador(facturaId: string): Promise<void> {
    const db = this.afs.firestore;
    const facturaRef = db.collection(this.collectionPath).doc(facturaId);
    const now = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      // READ phase
      const facturaSnap = await tx.get(facturaRef);
      if (!facturaSnap.exists) throw new Error('FACTURA_NOT_FOUND');
      const factura = facturaSnap.data() as Factura;
      if (factura.estado !== 'borrador') throw new Error('FACTURA_NOT_DRAFT');

      const seqRef = db.collection(this.ncfSequencePath).doc('INTERNA_FACTURA');
      const seqSnap = await tx.get(seqRef);
      const numeroSecuencia = (seqSnap.exists ? Number((seqSnap.data() as any)?.ultimo || 0) : 0) + 1;
      const numero = generarNumeroFactura(numeroSecuencia);

      const inventoryItems = (factura.items || []).filter((item) => !!item.productoServicioId && item.tipo === 'producto' && item.manejaInventario);
      const readBuffer: Array<{ item: FacturaItem; productRef: any; stockActual: number; stockNuevo: number }> = [];

      for (const item of inventoryItems) {
        const productRef = db.collection(this.productsPath).doc(item.productoServicioId as string);
        const productSnap = await tx.get(productRef);
        if (!productSnap.exists) throw new Error('PRODUCT_NOT_FOUND');
        const product = productSnap.data() as any;
        const stockActual = Number(product?.stockActual || 0);
        const qty = Number(item.cantidad || 0);
        if (qty > stockActual) throw new Error(`INSUFFICIENT_STOCK:${item.descripcion}`);
        const stockNuevo = Number((stockActual - qty).toFixed(2));
        readBuffer.push({ item, productRef, stockActual, stockNuevo });
      }

      // WRITE phase
      tx.set(seqRef, { ultimo: numeroSecuencia, actualizadoEn: now }, { merge: true });

      for (const row of readBuffer) {
        const qty = Number(row.item.cantidad || 0);
        tx.update(row.productRef, {
          stockActual: row.stockNuevo,
          fechaActualizacion: now,
        });
        const movRef = db.collection(this.stockMovementPath).doc();
        tx.set(movRef, {
          productoId: row.item.productoServicioId,
          productoNombre: row.item.descripcion,
          tipoMovimiento: 'salida_venta',
          cantidad: qty,
          costoUnitario: Number(row.item.costoUnitario || 0),
          costoTotal: Number((qty * Number(row.item.costoUnitario || 0)).toFixed(2)),
          referenciaTipo: 'factura',
          referenciaId: facturaId,
          motivo: `Salida por venta ${numero}`,
          stockAnterior: row.stockActual,
          stockNuevo: row.stockNuevo,
          creadoPor: factura.creadaPor,
          fecha: now,
        });
      }

      tx.update(facturaRef, this.sanitizeForFirestore({
        numero,
        numeroFactura: numero,
        ncf: '',
        estado: 'emitida',
        inventarioAfectado: true,
        actualizadoEn: now,
      }));
    });

    const facturaEmitida = await this.getFacturaSnapshot(facturaId);
    if (facturaEmitida) {
      await this.registrarIngresoFinanciero(facturaEmitida, facturaId);
      if (facturaEmitida.citaId) {
        await this.agendaService.updateCita(facturaEmitida.citaId, {
          estado: 'atendida',
          observacion: `Facturada ${facturaEmitida.numero}`.trim(),
        } as any);
      }
    }
  }

  async anularFactura(id: string, motivo?: string): Promise<void> {
    const db = this.afs.firestore;
    const facturaRef = db.collection(this.collectionPath).doc(id);
    const now = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      // READ phase
      const facturaSnap = await tx.get(facturaRef);
      if (!facturaSnap.exists) throw new Error('FACTURA_NOT_FOUND');
      const factura = facturaSnap.data() as Factura;
      if (factura.estado === 'anulada') throw new Error('FACTURA_ALREADY_CANCELED');

      const reverseBuffer: Array<{ item: FacturaItem; productRef: any; stockActual: number; stockNuevo: number }> = [];
      if (factura.inventarioAfectado) {
        for (const item of factura.items || []) {
          if (!item.productoServicioId || item.tipo !== 'producto' || !item.manejaInventario) continue;
          const productRef = db.collection(this.productsPath).doc(item.productoServicioId);
          const productSnap = await tx.get(productRef);
          if (!productSnap.exists) continue;
          const product = productSnap.data() as any;
          const stockActual = Number(product?.stockActual || 0);
          const qty = Number(item.cantidad || 0);
          const stockNuevo = Number((stockActual + qty).toFixed(2));
          reverseBuffer.push({ item, productRef, stockActual, stockNuevo });
        }
      }

      // WRITE phase
      for (const row of reverseBuffer) {
        const qty = Number(row.item.cantidad || 0);
        tx.update(row.productRef, { stockActual: row.stockNuevo, fechaActualizacion: now });

        const movRef = db.collection(this.stockMovementPath).doc();
        tx.set(movRef, {
          productoId: row.item.productoServicioId,
          productoNombre: row.item.descripcion,
          tipoMovimiento: 'anulacion_compra',
          cantidad: qty,
          costoUnitario: Number(row.item.costoUnitario || 0),
          costoTotal: Number((qty * Number(row.item.costoUnitario || 0)).toFixed(2)),
          referenciaTipo: 'factura_anulada',
          referenciaId: id,
          motivo: `Reversa por anulación de factura ${factura.numero}`,
          stockAnterior: row.stockActual,
          stockNuevo: row.stockNuevo,
          creadoPor: factura.creadaPor,
          fecha: now,
        });
      }

      tx.update(facturaRef, {
        estado: 'anulada',
        estadoFiscal: 'anulada',
        motivoAnulacion: motivo?.trim() || null,
        anuladaEn: now,
        actualizadoEn: now,
      });
    });
  }

  updateEstado(id: string, estado: Factura['estado']): Promise<void> {
    return this.firestoreBase.update<Factura>(this.collectionPath, id, { estado, actualizadoEn: new Date().toISOString() });
  }

  async validarStockItems(items: FacturaItem[]): Promise<void> {
    const products = await this.firestoreBase.listOnce<any>(this.productsPath);
    for (const item of items) {
      if (!item.productoServicioId || item.tipo !== 'producto' || !item.manejaInventario) continue;
      const product = products.find((p) => p.id === item.productoServicioId);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');
      const stock = Number(product.stockActual || 0);
      if (Number(item.cantidad || 0) > stock) throw new Error(`INSUFFICIENT_STOCK:${item.descripcion}`);
    }
  }

  private validateFiscalCliente(payload: Omit<Factura, 'numero' | 'estado'>): void {
    const doc = String(payload.clienteRncCedula || '').replace(/\D/g, '');
    if (!doc) return;
    const isRnc = doc.length === 9;
    const isCedula = doc.length === 11;
    if (!isRnc && !isCedula) throw new Error('INVALID_RNC_CEDULA');
  }

  private async getAndIncrementNcfSequenceTx(
    tx: any,
    tipoComprobante: NonNullable<Factura['tipoComprobante']>,
  ): Promise<number> {
    const db = this.afs.firestore;
    const seqRef = db.collection(this.ncfSequencePath).doc(tipoComprobante);
    const seqSnap = await tx.get(seqRef);
    const current = seqSnap.exists ? Number((seqSnap.data() as any)?.ultimo || 0) : 0;
    const next = current + 1;
    tx.set(seqRef, { tipoComprobante, ultimo: next, actualizadoEn: new Date().toISOString() }, { merge: true });
    return next;
  }

  private async getNextInternalNumberTx(tx: any): Promise<string> {
    const seq = await this.getAndIncrementInternalSequenceTx(tx);
    return generarNumeroFactura(seq);
  }

  /**
   * Contador interno atómico para numeración de facturas.
   * Evita query read dentro de transacción (fuente común de fallos al emitir).
   */
  private async getAndIncrementInternalSequenceTx(tx: any): Promise<number> {
    const db = this.afs.firestore;
    const seqRef = db.collection(this.ncfSequencePath).doc('INTERNA_FACTURA');
    const seqSnap = await tx.get(seqRef);
    const current = seqSnap.exists ? Number((seqSnap.data() as any)?.ultimo || 0) : 0;
    const next = current + 1;
    tx.set(seqRef, { ultimo: next, actualizadoEn: new Date().toISOString() }, { merge: true });
    return next;
  }

  private buildNcf(tipo: NonNullable<Factura['tipoComprobante']>, sequence: number): string {
    return `${tipo}${String(sequence).padStart(8, '0')}`;
  }

  /**
   * Firestore Transaction#set no admite valores undefined.
   * Este sanitizador evita fallos al emitir factura sin cliente/cita.
   */
  private sanitizeForFirestore<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== undefined)
        .map((item) => this.sanitizeForFirestore(item)) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, this.sanitizeForFirestore(v)]);
      return Object.fromEntries(entries) as T;
    }
    return value;
  }

  private async registrarIngresoFinanciero(factura: Factura, facturaId: string): Promise<void> {
    const montoIngreso = Number(factura.pagos?.totalPagadoAhora ?? factura.total ?? 0);
    if (montoIngreso <= 0) return;
    const ingreso: MovimientoFinanciero = {
      tipo: 'ingreso',
      categoria: 'facturacion',
      monto: montoIngreso,
      descripcion: `Ingreso por factura ${factura.numero}`,
      artistaId: factura.artistaId,
      citaId: factura.citaId,
      facturaId,
      fecha: factura.fecha,
      creadoPor: factura.creadaPor,
    };
    await this.finanzasService.create(ingreso);
  }

  async createCuentaPorCobrarFromFactura(facturaId: string, factura: Factura, userId: string): Promise<string | null> {
    const montoCredito = Number(factura.pagos?.totalCredito || factura.pagos?.credito || 0);
    if (montoCredito <= 0) return null;
    const now = new Date();
    const fechaVencimiento = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();
    const payload: CuentaPorCobrar = {
      facturaId,
      citaId: factura.citaId,
      clienteId: String(factura.clienteId || 'consumidor-final'),
      clienteNombre: String(factura.clienteNombre || 'Consumidor final'),
      clienteDocumento: factura.clienteRncCedula,
      numeroFactura: String(factura.numero || factura.numeroFactura || facturaId),
      fechaEmision: String(factura.fecha || now.toISOString()),
      fechaVencimiento,
      moneda: 'DOP',
      montoOriginal: montoCredito,
      montoPagado: 0,
      balancePendiente: montoCredito,
      estado: 'pendiente',
      metodoOrigen: factura.formaPago === 'credito' ? 'credito' : 'mixto',
      creadoPor: userId,
      fechaCreacion: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return this.firestoreBase.create<CuentaPorCobrar>('cuentasPorCobrar', payload);
  }

  private async obtenerSecuenciaFactura(): Promise<number> {
    const facturas = await this.firestoreBase.listOnce<Factura>(this.collectionPath);
    return facturas.length + 1;
  }

  private async getFacturaSnapshot(facturaId: string): Promise<Factura | null> {
    const items = await this.firestoreBase.listOnce<Factura>(this.collectionPath);
    return items.find((item) => item.id === facturaId) || null;
  }
}
