import { FacturaItem } from '../models/factura-item.model';

export const calcularTotalItem = (cantidad: number, precioUnitario: number): number => cantidad * precioUnitario;

export const calcularSubtotalFactura = (items: FacturaItem[]): number =>
  items.reduce((acc, item) => acc + item.total, 0);

export const calcularImpuestoFactura = (subtotal: number, porcentaje: number): number =>
  porcentaje > 0 ? subtotal * (porcentaje / 100) : 0;

export const calcularTotalFactura = (subtotal: number, impuesto: number): number => subtotal + impuesto;
