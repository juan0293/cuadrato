export interface FacturaItem {
  origen?: 'cita' | 'catalogo';
  productoServicioId?: string;
  codigo?: string;
  descripcion: string;
  tipo?: 'producto' | 'servicio';
  cantidad: number;
  precioUnitario: number;
  costoUnitario?: number;
  descuento?: number;
  aplicaItbis?: boolean;
  porcentajeItbis?: number;
  itbis?: number;
  subtotal?: number;
  categoria?: string;
  manejaInventario?: boolean;
  stockActual?: number;
  total: number;
}
