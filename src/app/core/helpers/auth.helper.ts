import { AppRole } from '../models/app-role.model';

/**
 * Centraliza la regla de destino inicial por rol para mantener
 * una sola fuente de verdad de navegación post-login.
 */
export function resolveHomeByRole(role: AppRole): string {
  switch (role) {
    case 'artista':
    case 'artist':
      return '/admin/dashboard';
    case 'asistente':
    case 'assistant':
      return '/admin/dashboard';
    case 'superadmin':
    case 'admin':
    default:
      return '/admin/dashboard';
  }
}
