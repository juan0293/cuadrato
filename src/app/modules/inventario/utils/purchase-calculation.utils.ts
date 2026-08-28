import { CompraItem } from '../models/compra-item.model';

export interface TotalesCompra {
  subtotal: number;
  totalDescuento: number;
  totalItbis: number;
  totalImpuestosAdicionales: number;
  total: number;
}

/**
 * Normaliza montos monetarios a 2 decimales para evitar arrastres de punto flotante.
 */
export function roundCurrency(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * Calcula subtotal de línea desde valores numéricos limpios.
 * Nunca usa valores formateados con moneda para evitar descuadres.
 */
export function calculateCompraItemSubtotal(cantidad: number, precioCompra: number, descuento = 0): number {
  const bruto = Number(cantidad || 0) * Number(precioCompra || 0);
  const subtotal = bruto - Number(descuento || 0);
  return roundCurrency(Math.max(subtotal, 0));
}

export function calculateCompraItemItbis(subtotal: number, tasaItbis: number): number {
  return roundCurrency(Number(subtotal || 0) * (Number(tasaItbis || 0) / 100));
}

export function calculateCompraItemTotal(subtotal: number, itbis: number, impuestosAdicionales = 0): number {
  return roundCurrency(Number(subtotal || 0) + Number(itbis || 0) + Number(impuestosAdicionales || 0));
}

export function calculateSalePrice(precioCompra: number, utilidadPorcentaje: number): number {
  const compra = Number(precioCompra || 0);
  const utilidad = Number(utilidadPorcentaje || 0);
  return roundCurrency(compra + (compra * utilidad / 100));
}

export function calculateCompraTotals(items: CompraItem[]): TotalesCompra {
  const subtotal = roundCurrency(items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0));
  const totalItbis = roundCurrency(items.reduce((acc, item) => acc + Number(item.montoItbis || 0), 0));
  const totalImpuestosAdicionales = roundCurrency(items.reduce((acc, item) => acc + Number(item.montoImpuestosAdicionales || 0), 0));
  const totalDescuento = roundCurrency(items.reduce((acc, item) => acc + Number(item.descuento || 0), 0));
  const total = roundCurrency(subtotal + totalItbis + totalImpuestosAdicionales);
  return { subtotal, totalDescuento, totalItbis, totalImpuestosAdicionales, total };
}

// aliases compat
export const calculatePurchaseItemSubtotal = calculateCompraItemSubtotal;
export const calculatePurchaseTotals = calculateCompraTotals;
