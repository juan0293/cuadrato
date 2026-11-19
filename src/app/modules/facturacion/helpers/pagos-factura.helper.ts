import { Factura } from '../models/factura.model';

const monto = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0;
};
const round = (value: number) => Number(value.toFixed(2));

export function normalizarMetodoPagoFactura(value: unknown): 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro' {
  const method = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (['efectivo', 'cash'].includes(method)) return 'efectivo';
  if (['tarjeta', 'card', 'credito-debito', 'debito'].includes(method)) return 'tarjeta';
  if (['transferencia', 'transfer'].includes(method)) return 'transferencia';
  if (['credito', 'a credito'].includes(method)) return 'credito';
  return 'otro';
}

/** Montos aplicados a la venta; nunca suma el efectivo entregado para cambio. */
export function desglosarPagosFactura(factura: Factura) {
  const pagos = factura.pagos;
  if (!pagos) {
    const method = normalizarMetodoPagoFactura(factura.formaPago);
    const total = monto(factura.total);
    return { efectivo: method === 'efectivo' ? total : 0, tarjeta: method === 'tarjeta' ? total : 0,
      transferencia: method === 'transferencia' ? total : 0, credito: method === 'credito' ? total : 0 };
  }
  let efectivo = monto(pagos.efectivo);
  const tarjeta = monto(pagos.tarjeta), transferencia = monto(pagos.transferencia);
  const credito = monto(pagos.credito ?? pagos.totalCredito);
  // El POS ya guardaba pagos netos. Restar devuelta otra vez subestima caja.
  // Compatibilidad con documentos antiguos que sí guardaban efectivo recibido:
  // solo retirar el cambio cuando existe un exceso comprobable sobre la venta.
  const exceso = round(efectivo + tarjeta + transferencia + credito - monto(factura.total));
  if (!pagos.montosAplicados && exceso > 0) {
    efectivo = round(Math.max(0, efectivo - Math.min(exceso, monto(factura.devuelta ?? factura.cambio))));
  }
  return { efectivo, tarjeta, transferencia, credito };
}

export interface PagoRecibido {
  efectivo: number; tarjeta: number; transferencia: number; credito: number;
  totalPagadoAhora: number; totalRegistrado: number; diferencia: number;
}

/** Conserva íntegros los importes de tarjeta/transferencia y devuelve solo efectivo. */
export function aplicarPagoAFactura(pago: PagoRecibido, total: number) {
  const devuelta = round(Math.max(0, pago.totalPagadoAhora - Math.max(0, total - pago.credito)));
  if (devuelta > pago.efectivo + 0.005) throw new Error('CHANGE_EXCEEDS_CASH');
  const efectivo = round(Math.max(0, pago.efectivo - devuelta));
  const totalPagadoAhora = round(efectivo + pago.tarjeta + pago.transferencia);
  const totalRegistrado = round(totalPagadoAhora + pago.credito);
  return { ...pago, efectivo, totalPagadoAhora, totalRegistrado,
    diferencia: round(total - totalRegistrado), montosAplicados: true as const };
}
