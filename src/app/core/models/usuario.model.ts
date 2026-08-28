import { AppRole } from './app-role.model';

export interface Usuario {
  id?: string;
  companyId?: string;
  displayName?: string;
  nombre: string;
  email: string;
  rol: AppRole;
  role?: AppRole;
  status?: 'active' | 'inactive';
  telefono?: string;
  photoURL?: string;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  fechaCreacion: unknown;
}
