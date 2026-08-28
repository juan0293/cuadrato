import { EstadoCuentaPorPagar } from '../models/cuenta-por-pagar.model';

export const calcularBalancePendiente = (montoOriginal: number, montoPagado: number): number => {
  return Number(Math.max(0, montoOriginal - montoPagado).toFixed(2));
};

/**
 * Estado operativo de CxP:
 * - pagada cuando el balance llega a 0
 * - parcial cuando existe pago pero aún hay balance
 * - vencida cuando hay balance y la fecha de vencimiento pasó
 * - pendiente en el resto de los casos
 */
export const resolverEstadoCuentaPorPagar = (
  montoOriginal: number,
  montoPagado: number,
  fechaVencimiento: unknown,
  now = new Date(),
): EstadoCuentaPorPagar => {
  const balance = calcularBalancePendiente(montoOriginal, montoPagado);

  if (balance <= 0) return 'pagada';
  if (montoPagado > 0) return 'parcial';

  const vencimiento = new Date(String(fechaVencimiento));
  if (!Number.isNaN(vencimiento.getTime()) && vencimiento.getTime() < now.getTime()) {
    return 'vencida';
  }

  return 'pendiente';
};
