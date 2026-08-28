import { endOfDay, endOfMonth, endOfWeek, endOfYear, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { FiltroPeriodoFinanciero, MovimientoFinanciero } from '../models/movimiento-financiero.model';

export const filtrarPorPeriodo = (
  items: MovimientoFinanciero[],
  periodo: FiltroPeriodoFinanciero,
  baseDate = new Date(),
): MovimientoFinanciero[] => {
  const interval = (() => {
    if (periodo === 'diario') return { start: startOfDay(baseDate), end: endOfDay(baseDate) };
    if (periodo === 'semanal') return { start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) };
    if (periodo === 'mensual') return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
    return { start: startOfYear(baseDate), end: endOfYear(baseDate) };
  })();

  return items.filter((item) => isWithinInterval(parseISO(item.fecha), interval));
};
