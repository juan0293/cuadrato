export interface Insumo {
  id?: string;
  nombre: string;
  categoria: string;
  unidadMedida: string;
  stockActual: number;
  stockMinimo: number;
  costoUnitario?: number;
  activo: boolean;
  fechaCreacion: string;
}
