import { UserRole } from '../models/usuario.model';

export const roleLabel = (role: UserRole): string => {
  if (role === 'superadmin') return 'Superadministrador';
  if (role === 'admin') return 'Administrador';
  if (role === 'assistant' || role === 'asistente') return 'Asistente';
  return 'Artista';
};
