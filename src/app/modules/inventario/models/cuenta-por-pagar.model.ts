export type EstadoCuentaPorPagar = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'anulada';

export interface PagoCuentaPorPagar {
  id?: string;
  cuentaId: string;
  proveedorId: string;
  proveedorNombre: string;
  monto: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque';
  fechaPago: string;
  referencia?: string;
  nota?: string;
  creadoPor: string;
  fechaCreacion: string;
}

export interface CuentaPorPagarKpis {
  totalPendiente: number;
  totalVencido: number;
  pagadoMesActual: number;
  facturasPendientes: number;
}

export interface CuentaPorPagar {
  id?: string;
  proveedorId: string;
  proveedorNombre: string;
  compraId: string;
  numeroFactura: string;
  montoOriginal: number;
  montoPagado: number;
  balancePendiente: number;
  fechaEmision: unknown;
  fechaVencimiento: unknown;
  estado: EstadoCuentaPorPagar;
  moneda: string;
  nota?: string;
  creadoPor: string;
  fechaCreacion: unknown;
  fechaAnulacion?: string;
  motivoAnulacion?: string;
  anuladoPor?: string;
}
