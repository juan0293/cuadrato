export interface Utilidad {
  id?: string;
  nombre: string;
  porcentaje: number;
  descripcion?: string;
  activo: boolean;
  orden?: number;
  creadoPor?: string;
  fechaCreacion?: unknown;
  actualizadoPor?: string;
  fechaActualizacion?: unknown;
}
