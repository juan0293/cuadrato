export type EstadoCuentaPorCobrar = 'pendiente' | 'parcial' | 'pagada' | 'anulada' | 'vencida';

export interface CuentaPorCobrar {
  id?: string;
  facturaId: string;
  citaId?: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDocumento?: string;
  numeroFactura: string;
  fechaEmision: string;
  fechaVencimiento: string;
  moneda: 'DOP';
  montoOriginal: number;
  montoPagado: number;
  balancePendiente: number;
  estado: EstadoCuentaPorCobrar;
  metodoOrigen: 'abono' | 'credito' | 'mixto';
  origen?: 'cita' | 'factura';
  creadoPor: string;
  fechaCreacion: string;
  updatedAt: string;
}

export interface CobroCuentaPorCobrar {
  id?: string;
  cuentaId: string;
  facturaId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodoCobro: 'efectivo' | 'tarjeta' | 'transferencia';
  fechaCobro: string;
  referencia?: string;
  nota?: string;
  creadoPor: string;
  fechaCreacion: string;
}
