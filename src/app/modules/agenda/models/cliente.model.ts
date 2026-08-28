export interface Cliente {
  id?: string;
  nombreCompleto: string;
  rncCedula?: string;
  telefono?: string;
  correo?: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}
