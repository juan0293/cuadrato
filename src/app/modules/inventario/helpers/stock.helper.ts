import { esStockBajo } from '../utils/stock-calculation.utils';
import { TipoMovimientoInventario } from '../models/movimiento-inventario.model';

export const obtenerColorStock = (stockActual: number, stockMinimo: number): string =>
  esStockBajo(stockActual, stockMinimo) ? 'danger' : 'success';

/**
 * Determina si el movimiento incrementa o reduce stock dentro del nuevo
 * flujo fiscal-ready. Se mantiene separado para reutilizar en compras,
 * decomisos y ajustes físicos en fases siguientes.
 */
export const resolverDireccionMovimiento = (tipoMovimiento: TipoMovimientoInventario): 'entrada' | 'salida' => {
  if (tipoMovimiento === 'entrada' || tipoMovimiento === 'entrada_compra' || tipoMovimiento === 'ajuste_fisico') {
    return 'entrada';
  }
  return 'salida';
};
