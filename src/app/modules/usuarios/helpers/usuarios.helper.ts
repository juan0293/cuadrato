import { UserRole } from '../models/usuario.model';

export const roleLabel = (role: UserRole): string => {
  if (role === 'superadmin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'assistant' || role === 'asistente') return 'Assistant';
  return 'Artist';
};
