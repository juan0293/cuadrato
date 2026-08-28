import { Cita } from '../../agenda/models/cita.model';

export const ordenarCitas = (items: Cita[]): Cita[] =>
  [...items].sort((a, b) => `${a.fecha} ${a.horaInicio}`.localeCompare(`${b.fecha} ${b.horaInicio}`));
