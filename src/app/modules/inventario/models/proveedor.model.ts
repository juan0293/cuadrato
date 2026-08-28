export interface Proveedor {
  id?: string;
  nombre: string;
  rnc?: string;
  tipoIdentificacion?: 'rnc' | 'cedula' | 'pasaporte' | 'otro';
  telefono?: string;
  email?: string;
  direccion?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
  condicionesPagoDefault?: 'contado' | 'credito';
  diasCreditoDefault?: number;
  monedaDefault?: 'DOP' | 'USD' | 'EUR' | 'CAD' | 'GBP';
  activo: boolean;
  notas?: string;
  creadoPor?: string;
  fechaCreacion?: unknown;
  actualizadoPor?: string;
  fechaActualizacion?: unknown;
}
