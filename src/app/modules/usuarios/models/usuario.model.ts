export type UserRole = 'superadmin' | 'admin' | 'assistant' | 'artist' | 'asistente' | 'artista';
export type UserStatus = 'active' | 'inactive';

export interface UsuarioModel {
  id?: string;
  companyId?: string;
  displayName?: string;
  nombre?: string;
  email: string;
  role?: UserRole;
  rol?: UserRole;
  status?: UserStatus;
  activo?: boolean;
  telefono?: string;
  photoURL?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  fechaCreacion?: unknown;
}
