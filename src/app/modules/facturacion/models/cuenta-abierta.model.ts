import { FacturaItem } from './factura-item.model';

export interface CuentaAbiertaConsumo {
  clienteNombre: string;
  clienteId: string;
  items: FacturaItem[];
  descuentoGlobal: number;
}

export interface CuentaAbierta extends CuentaAbiertaConsumo {
  id: string;
  estado: 'abierta' | 'cerrada' | 'cancelada';
  version: number;
  subtotal: number;
  impuesto: number;
  total: number;
  creadaEn: string;
  creadaPor: string;
  creadaPorNombre?: string;
  actualizadaEn: string;
  actualizadaPor: string;
  facturaId?: string;
  cerradaEn?: string;
  motivoCancelacion?: string;
}
