export interface CategoriaProducto {
  id?: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  tipoDefault?: 'bien' | 'servicio';
  manejaInventarioDefault?: boolean;
  activo: boolean;
  orden?: number;
  creadoPor?: string;
  fechaCreacion?: unknown;
  actualizadoPor?: string;
  fechaActualizacion?: unknown;
}
