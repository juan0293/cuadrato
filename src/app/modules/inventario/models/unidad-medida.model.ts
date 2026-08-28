export interface UnidadMedida {
  id?: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  tipo?: 'unidad' | 'peso' | 'volumen' | 'tiempo' | 'servicio' | 'otro';
  activo: boolean;
  orden?: number;
  creadoPor?: string;
  fechaCreacion?: unknown;
  actualizadoPor?: string;
  fechaActualizacion?: unknown;
}
