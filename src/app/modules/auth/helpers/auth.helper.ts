import { Usuario } from '../../../core/models/usuario.model';

/** Construye una etiqueta de perfil para cabeceras y tarjetas de usuario autenticado. */
export const buildUserIdentityLabel = (profile: Usuario | null): string => {
  if (!profile) return 'Sin perfil';
  return `${profile.nombre} · ${profile.rol}`;
};
