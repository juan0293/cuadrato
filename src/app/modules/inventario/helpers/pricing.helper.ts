import { calculateSalePrice } from '../utils/pricing-calculation.utils';

/**
 * Recalcula precio de venta solo cuando no hay override manual.
 */
export function resolvePrecioVenta(
  precioCompra: number,
  utilidadPorcentaje: number,
  precioVentaManual: boolean,
  precioVentaActual: number,
): number {
  if (precioVentaManual) {
    return Number(precioVentaActual || 0);
  }
  return calculateSalePrice(precioCompra, utilidadPorcentaje);
}
