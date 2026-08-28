import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { validateCompraBeforeConfirm } from '../helpers/compras.helper';
import { Compra } from '../models/compra.model';
import { MovimientoInventario } from '../models/movimiento-inventario.model';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { MovimientosInventarioService } from './movimientos-inventario.service';
import { ProductosServiciosService } from './productos-servicios.service';

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private readonly collectionPath = 'compras';

  constructor(
    private readonly afs: AngularFirestore,
    private readonly firestoreBase: FirestoreBaseService,
    private readonly movimientosInventarioService: MovimientosInventarioService,
    private readonly cuentasPorPagarService: CuentasPorPagarService,
    private readonly productosServiciosService: ProductosServiciosService,
  ) {}

  getCompras(): Observable<Compra[]> {
    return this.firestoreBase.list<Compra>(this.collectionPath);
  }

  list(): Observable<Compra[]> {
    return this.getCompras();
  }

  getCompraById(id: string): Observable<Compra> {
    return this.firestoreBase.getById<Compra>(this.collectionPath, id);
  }

  getById(id: string): Observable<Compra> {
    return this.getCompraById(id);
  }

  createCompraBorrador(payload: Compra): Promise<string> {
    return this.firestoreBase.create<Compra>(this.collectionPath, payload);
  }

  create(payload: Compra): Promise<string> {
    return this.createCompraBorrador(payload);
  }

  updateCompra(id: string, payload: Partial<Compra>): Promise<void> {
    return this.firestoreBase.update<Compra>(this.collectionPath, id, payload);
  }

  update(id: string, payload: Partial<Compra>): Promise<void> {
    return this.updateCompra(id, payload);
  }

  async confirmarCompra(id: string): Promise<void> {
    const compra = await firstValueFrom(this.getById(id));

    if (!compra?.id) throw new Error('COMPRA_NOT_FOUND');
    if (compra.estado === 'confirmada' || compra.inventarioAfectado) throw new Error('COMPRA_ALREADY_PROCESSED');

    const errors = validateCompraBeforeConfirm(compra);
    if (errors.length) throw new Error('COMPRA_INVALID');

    if (compra.afectaInventario) {
      for (const item of compra.items) {
        if (!item.manejaInventario || item.tipoItem !== 'bien') continue;

        await this.movimientosInventarioService.registrarEntradaCompra({
          productoId: item.productoId,
          productoNombre: item.nombre,
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario,
          compraId: compra.id,
          creadoPor: compra.creadoPor || 'sistema',
        });

        const updatePayload: Record<string, unknown> = {
          precioCompra: item.costoUnitario,
          ultimoCosto: item.costoUnitario,
          fechaActualizacion: new Date().toISOString(),
        };

        if (item.actualizarUtilidadProducto) {
          updatePayload["utilidadId"] = item.utilidadId;
          updatePayload["utilidadNombre"] = item.utilidadNombre;
          updatePayload["utilidadPorcentaje"] = item.utilidadPorcentaje;
        }

        if (item.actualizarPrecioVentaProducto) {
          updatePayload["precioVenta"] = item.precioVentaSugerido ?? item.costoUnitario;
        }

        await this.productosServiciosService.update(item.productoId, updatePayload as any);
      }
    }

    let cuentaPorPagarId = compra.cuentaPorPagarId;
    if (compra.condicionPago === 'credito' && !cuentaPorPagarId) {
      cuentaPorPagarId = await this.cuentasPorPagarService.createFromCompra(compra);
    }

    await this.update(id, {
      estado: 'confirmada',
      inventarioAfectado: true,
      cuentaPorPagarId,
      confirmadoPor: compra.creadoPor || 'sistema',
      fechaConfirmacion: new Date().toISOString(),
    });
  }

  async anularCompra(id: string): Promise<void> {
    const db = this.afs.firestore;
    const compraRef = db.doc(`${this.collectionPath}/${id}`);

    await db.runTransaction(async (tx) => {
      const compraSnap = await tx.get(compraRef);
      if (!compraSnap.exists) throw new Error('COMPRA_NOT_FOUND');

      const compra = { id: compraSnap.id, ...(compraSnap.data() as Compra) } as Compra;
      if (compra.estado === 'anulada') throw new Error('COMPRA_ALREADY_VOIDED');
      if (compra.estado !== 'confirmada') throw new Error('ONLY_CONFIRMED_COMPRA_CAN_BE_VOIDED');

      const items = Array.isArray(compra.items) ? compra.items : [];
      const inventariables = items.filter((item) => item?.manejaInventario && item?.tipoItem === 'bien');
      const nowIso = new Date().toISOString();
      const movimientosCollection = db.collection('movimientosInventario');

      // Valida stock suficiente antes de aplicar cualquier cambio para evitar inconsistencias.
      for (const item of inventariables) {
        if (!item.productoId) throw new Error('COMPRA_ITEM_PRODUCT_REQUIRED');

        const productoRef = db.doc(`productosServicios/${item.productoId}`);
        const productoSnap = await tx.get(productoRef);
        if (!productoSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${item.productoId}`);

        const productoData = productoSnap.data() as { stockActual?: number; nombre?: string };
        const stockActual = Number(productoData?.stockActual || 0);
        const cantidad = Number(item.cantidad || 0);

        if (cantidad <= 0) continue;
        if (stockActual < cantidad) throw new Error(`INSUFFICIENT_STOCK_TO_REVERSE:${item.nombre || item.productoId}`);
      }

      for (const item of inventariables) {
        if (!item.productoId) continue;

        const productoRef = db.doc(`productosServicios/${item.productoId}`);
        const productoSnap = await tx.get(productoRef);
        const productoData = productoSnap.data() as { stockActual?: number; nombre?: string };
        const stockAnterior = Number(productoData?.stockActual || 0);
        const cantidad = Number(item.cantidad || 0);
        if (cantidad <= 0) continue;

        const stockNuevo = Number((stockAnterior - cantidad).toFixed(2));
        tx.update(productoRef, {
          stockActual: stockNuevo,
          fechaActualizacion: nowIso,
        });

        const movimientoRef = movimientosCollection.doc();
        const payload: MovimientoInventario = {
          productoId: item.productoId,
          productoNombre: item.nombre || productoData?.nombre || 'Producto',
          tipoMovimiento: 'anulacion_compra',
          cantidad,
          costoUnitario: Number(item.costoUnitario || item.precioCompra || 0),
          costoTotal: Number((cantidad * Number(item.costoUnitario || item.precioCompra || 0)).toFixed(2)),
          referenciaTipo: 'compra_anulacion',
          referenciaId: compra.id,
          motivo: `Reversa por anulación de compra ${compra.numeroFactura || compra.id}`,
          stockAnterior,
          stockNuevo,
          creadoPor: compra.anuladoPor || compra.creadoPor || 'sistema',
          fecha: nowIso,
        };

        tx.set(movimientoRef, payload);
      }

      tx.update(compraRef, {
        estado: 'anulada',
        inventarioReversado: true,
        anuladoPor: compra.creadoPor || 'sistema',
        fechaAnulacion: nowIso,
      } as Partial<Compra>);
    });
  }
}
