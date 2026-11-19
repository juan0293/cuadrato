export interface Cliente {
  id?: string;
  nombreCompleto: string;
  rncCedula?: string;
  rnc?: string;
  fechaNacimiento?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}
