import { CompraItem } from './compra-item.model';

export type CondicionPagoCompra = 'contado' | 'credito';
export type EstadoCompra = 'borrador' | 'confirmada' | 'anulada';

export interface Compra {
  id?: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRnc?: string;
  numeroFactura: string;
  ncf?: string;
  fechaEmision: unknown;
  fechaVencimiento?: unknown;
  condicionPago: CondicionPagoCompra;
  moneda: 'DOP' | 'USD' | 'EUR' | 'CAD' | 'GBP';
  tasaCambio?: number;
  items: CompraItem[];
  subtotal: number;
  totalDescuento: number;
  totalItbis: number;
  totalImpuestosAdicionales: number;
  total: number;
  estado: EstadoCompra;
  afectaInventario: boolean;
  inventarioAfectado?: boolean;
  cuentaPorPagarId?: string;
  creadoPor: string;
  fechaCreacion: unknown;
  confirmadoPor?: string;
  fechaConfirmacion?: unknown;
  anuladoPor?: string;
  fechaAnulacion?: unknown;
  inventarioReversado?: boolean;
}
