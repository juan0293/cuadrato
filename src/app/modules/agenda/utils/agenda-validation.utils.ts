import { Cita } from '../models/cita.model';
import { toMinutes } from './agenda-date.utils';

export const isTimeRangeValid = (horaInicio: string, horaFin: string): boolean =>
  toMinutes(horaInicio) < toMinutes(horaFin);

/**
 * Detecta cruce de horarios para el mismo artista en la misma fecha.
 * Evita doble asignación manual dentro del calendario interno.
 */
export const hasAppointmentConflict = (candidate: Cita, existing: Cita[]): boolean => {
  const start = toMinutes(candidate.horaInicio);
  const end = toMinutes(candidate.horaFin);

  return existing
    .filter((item) => item.id !== candidate.id)
    .filter((item) => item.artistaId === candidate.artistaId && item.fecha === candidate.fecha)
    .filter((item) => item.estado !== 'cancelada')
    .some((item) => {
      const existingStart = toMinutes(item.horaInicio);
      const existingEnd = toMinutes(item.horaFin);
      return start < existingEnd && end > existingStart;
    });
};
