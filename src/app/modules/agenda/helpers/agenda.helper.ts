import { Cita } from '../models/cita.model';

export const obtenerEstadoCitaLabel = (estado: Cita['estado']): string => {
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'atendida') return 'Atendida';
  if (estado === 'anulada') return 'Anulada';
  if (estado === 'reprogramada') return 'Reprogramada';
  if (estado === 'programada') return 'Programada';
  if (estado === 'confirmada') return 'Confirmada';
  if (estado === 'cancelada') return 'Cancelada';
  return 'Completada';
};

export const obtenerColorEstadoCita = (estado: Cita['estado']): string => {
  if (estado === 'pendiente') return 'warning';
  if (estado === 'atendida') return 'success';
  if (estado === 'anulada') return 'danger';
  if (estado === 'reprogramada') return 'tertiary';
  if (estado === 'programada') return 'primary';
  if (estado === 'confirmada') return 'success';
  if (estado === 'cancelada') return 'danger';
  return 'medium';
};

export const construirRangoSemanal = (diasISO: string[]): { fecha: string; label: string }[] =>
  diasISO.map((fecha) => ({ fecha, label: fecha }));
