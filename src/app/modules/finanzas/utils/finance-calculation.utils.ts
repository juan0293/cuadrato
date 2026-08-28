import { MovimientoFinanciero } from '../models/movimiento-financiero.model';

export const totalIngresos = (items: MovimientoFinanciero[]): number =>
  items.filter((item) => item.tipo === 'ingreso').reduce((acc, item) => acc + item.monto, 0);

export const totalGastos = (items: MovimientoFinanciero[]): number =>
  items.filter((item) => item.tipo === 'gasto').reduce((acc, item) => acc + item.monto, 0);

export const calcularBalance = (items: MovimientoFinanciero[]): number => totalIngresos(items) - totalGastos(items);

/**
 * Rentabilidad simplificada para operación MVP.
 * Si no hay gastos, retorna 100 para evitar división inválida y mostrar señal positiva.
 */
export const calcularRentabilidad = (items: MovimientoFinanciero[]): number => {
  const ingresos = totalIngresos(items);
  const gastos = totalGastos(items);
  if (gastos <= 0) return ingresos > 0 ? 100 : 0;
  return ((ingresos - gastos) / gastos) * 100;
};
