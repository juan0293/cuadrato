import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { Insumo } from '../models/insumo.model';
import { MovimientoInventario } from '../models/movimiento-inventario.model';
import { ProductoServicio } from '../models/producto-servicio.model';
import { resolverDireccionMovimiento } from '../helpers/stock.helper';
import { calcularStockDisponible } from '../utils/stock-calculation.utils';
import { validarCantidadMovimiento, validarStockNoNegativo } from '../utils/inventario-validation.utils';
import { InventarioService } from './inventario.service';
import { ProductosServiciosService } from './productos-servicios.service';

@Injectable({ providedIn: 'root' })
export class MovimientosInventarioService {
  private readonly collectionPath = 'movimientosInventario';

  constructor(
    private readonly firestoreBase: FirestoreBaseService,
    private readonly inventarioService: InventarioService,
    private readonly productosServiciosService: ProductosServiciosService,
  ) {}

  list(): Observable<MovimientoInventario[]> {
    return this.firestoreBase.list<MovimientoInventario>(this.collectionPath);
  }

  byInsumo(insumoId: string): Observable<MovimientoInventario[]> {
    return this.list().pipe(map((items) => items.filter((item) => item.insumoId === insumoId)));
  }

  async registrarMovimiento(payload: MovimientoInventario): Promise<string> {
    if (!payload.insumoId) throw new Error('INSUMO_REQUIRED');
    if (!payload.tipo) throw new Error('TIPO_REQUIRED');
    if (!validarCantidadMovimiento(payload.cantidad)) throw new Error('INVALID_QUANTITY');

    const insumo = await this.getInsumoSnapshot(payload.insumoId);
    if (!insumo?.id) throw new Error('INSUMO_NOT_FOUND');

    const nuevoStock = calcularStockDisponible(insumo.stockActual, payload.cantidad, payload.tipo);
    if (!validarStockNoNegativo(nuevoStock)) throw new Error('NEGATIVE_STOCK');

    const movimientoId = await this.firestoreBase.create<MovimientoInventario>(this.collectionPath, payload);
    await this.inventarioService.update(insumo.id, { stockActual: nuevoStock });
    return movimientoId;
  }

  async registrarMovimientoFiscal(payload: MovimientoInventario): Promise<string> {
    if (!payload.productoId) throw new Error('PRODUCT_REQUIRED');
    if (!payload.tipoMovimiento) throw new Error('TIPO_MOVIMIENTO_REQUIRED');
    if (!validarCantidadMovimiento(payload.cantidad)) throw new Error('INVALID_QUANTITY');

    const item = await this.getProductoSnapshot(payload.productoId);
    if (!item?.id) throw new Error('PRODUCT_NOT_FOUND');

    if (!item.manejaInventario) {
      return this.firestoreBase.create<MovimientoInventario>(this.collectionPath, {
        ...payload,
        productoNombre: payload.productoNombre ?? item.nombre,
      });
    }

    const direction = resolverDireccionMovimiento(payload.tipoMovimiento);
    const stockAnterior = Number(item.stockActual || 0);
    const stockNuevo = calcularStockDisponible(stockAnterior, payload.cantidad, direction);
    if (!validarStockNoNegativo(stockNuevo)) throw new Error('NEGATIVE_STOCK');

    const movimientoId = await this.firestoreBase.create<MovimientoInventario>(this.collectionPath, {
      ...payload,
      productoNombre: payload.productoNombre ?? item.nombre,
      stockAnterior,
      stockNuevo,
      fecha: payload.fecha || new Date().toISOString(),
    });

    await this.productosServiciosService.update(item.id, {
      stockActual: stockNuevo,
      fechaActualizacion: new Date().toISOString(),
    });

    return movimientoId;
  }

  /**
   * Entrada de compra retail: crea movimiento con trazabilidad directa
   * al documento de compra y devuelve stock resultante.
   */
  async registrarEntradaCompra(params: {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    costoUnitario: number;
    compraId: string;
    creadoPor: string;
  }): Promise<{ stockAnterior: number; stockNuevo: number }> {
    const item = await this.getProductoSnapshot(params.productoId);
    if (!item?.id) throw new Error('PRODUCT_NOT_FOUND');
    if (!item.manejaInventario) return { stockAnterior: Number(item.stockActual || 0), stockNuevo: Number(item.stockActual || 0) };

    const stockAnterior = Number(item.stockActual || 0);
    const stockNuevo = Number((stockAnterior + Number(params.cantidad || 0)).toFixed(2));

    const payload: MovimientoInventario = {
      productoId: item.id,
      productoNombre: params.productoNombre,
      tipoMovimiento: 'entrada_compra',
      cantidad: Number(params.cantidad || 0),
      costoUnitario: Number(params.costoUnitario || 0),
      costoTotal: Number((Number(params.cantidad || 0) * Number(params.costoUnitario || 0)).toFixed(2)),
      referenciaTipo: 'compra',
      referenciaId: params.compraId,
      motivo: `Entrada por compra ${params.compraId}`,
      stockAnterior,
      stockNuevo,
      creadoPor: params.creadoPor,
      fecha: new Date().toISOString(),
    };

    await this.firestoreBase.create<MovimientoInventario>(this.collectionPath, payload);
    await this.productosServiciosService.update(item.id, {
      stockActual: stockNuevo,
      ultimoCosto: Number(params.costoUnitario || 0),
      costoPromedio: Number(params.costoUnitario || 0),
      fechaActualizacion: new Date().toISOString(),
    });

    return { stockAnterior, stockNuevo };
  }

  /**
   * Salida por venta: descuenta inventario únicamente para productos inventariables.
   */
  async registrarSalidaPorVenta(params: {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    costoUnitario?: number;
    facturaId: string;
    creadoPor: string;
  }): Promise<{ stockAnterior: number; stockNuevo: number }> {
    const item = await this.getProductoSnapshot(params.productoId);
    if (!item?.id) throw new Error('PRODUCT_NOT_FOUND');
    if (!item.manejaInventario) return { stockAnterior: Number(item.stockActual || 0), stockNuevo: Number(item.stockActual || 0) };

    const stockAnterior = Number(item.stockActual || 0);
    const quantity = Number(params.cantidad || 0);
    const stockNuevo = Number((stockAnterior - quantity).toFixed(2));
    if (stockNuevo < 0) throw new Error('INSUFFICIENT_STOCK');

    await this.firestoreBase.create<MovimientoInventario>(this.collectionPath, {
      productoId: item.id,
      productoNombre: params.productoNombre || item.nombre,
      tipoMovimiento: 'salida_venta',
      cantidad: quantity,
      costoUnitario: Number(params.costoUnitario || item.ultimoCosto || 0),
      costoTotal: Number((quantity * Number(params.costoUnitario || item.ultimoCosto || 0)).toFixed(2)),
      referenciaTipo: 'factura',
      referenciaId: params.facturaId,
      motivo: `Salida por venta ${params.facturaId}`,
      stockAnterior,
      stockNuevo,
      creadoPor: params.creadoPor,
      fecha: new Date().toISOString(),
    });

    await this.productosServiciosService.update(item.id, {
      stockActual: stockNuevo,
      fechaActualizacion: new Date().toISOString(),
    });

    return { stockAnterior, stockNuevo };
  }

  /**
   * Reversa de salida por anulación de factura.
   */
  async reversarSalidaPorAnulacion(params: {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    costoUnitario?: number;
    facturaId: string;
    creadoPor: string;
  }): Promise<{ stockAnterior: number; stockNuevo: number }> {
    const item = await this.getProductoSnapshot(params.productoId);
    if (!item?.id) throw new Error('PRODUCT_NOT_FOUND');
    if (!item.manejaInventario) return { stockAnterior: Number(item.stockActual || 0), stockNuevo: Number(item.stockActual || 0) };

    const stockAnterior = Number(item.stockActual || 0);
    const quantity = Number(params.cantidad || 0);
    const stockNuevo = Number((stockAnterior + quantity).toFixed(2));

    await this.firestoreBase.create<MovimientoInventario>(this.collectionPath, {
      productoId: item.id,
      productoNombre: params.productoNombre || item.nombre,
      tipoMovimiento: 'anulacion_compra',
      cantidad: quantity,
      costoUnitario: Number(params.costoUnitario || item.ultimoCosto || 0),
      costoTotal: Number((quantity * Number(params.costoUnitario || item.ultimoCosto || 0)).toFixed(2)),
      referenciaTipo: 'factura_anulada',
      referenciaId: params.facturaId,
      motivo: `Reversa por anulación de factura ${params.facturaId}`,
      stockAnterior,
      stockNuevo,
      creadoPor: params.creadoPor,
      fecha: new Date().toISOString(),
    });

    await this.productosServiciosService.update(item.id, {
      stockActual: stockNuevo,
      fechaActualizacion: new Date().toISOString(),
    });

    return { stockAnterior, stockNuevo };
  }

  private async getInsumoSnapshot(insumoId: string): Promise<Insumo | null> {
    return new Promise<Insumo | null>((resolve) => {
      this.inventarioService.getById(insumoId).subscribe({ next: resolve, error: () => resolve(null) });
    });
  }

  private async getProductoSnapshot(productoId: string): Promise<ProductoServicio | null> {
    return new Promise<ProductoServicio | null>((resolve) => {
      this.productosServiciosService.getById(productoId).subscribe({ next: resolve, error: () => resolve(null) });
    });
  }
}
