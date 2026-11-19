import { FacturaItem } from '../models/factura-item.model';
import { CuentaAbierta, CuentaAbiertaConsumo } from '../models/cuenta-abierta.model';
import { Factura } from '../models/factura.model';

// Misma regla del POS: descuento por línea antes de ITBIS; descuento global
// después de sumar los impuestos. Una cuenta nunca cambia la regla existente.
export function recalcularConsumo<T extends FacturaItem>(item: T): T {
  const subtotal = Math.max(0, Number((item.cantidad * item.precioUnitario - Number(item.descuento || 0)).toFixed(2)));
  const itbis = item.aplicaItbis ? Number((subtotal * Number(item.porcentajeItbis || 0) / 100).toFixed(2)) : 0;
  return { ...item, subtotal, itbis, total: Number((subtotal + itbis).toFixed(2)) };
}

export function calcularCuenta(consumo: CuentaAbiertaConsumo) {
  if (!consumo.clienteNombre.trim() || consumo.clienteNombre.trim().length > 120) throw new Error('ACCOUNT_NAME_REQUIRED');
  if (!Number.isFinite(consumo.descuentoGlobal) || consumo.descuentoGlobal < 0) throw new Error('ACCOUNT_INVALID_DISCOUNT');
  for (const item of consumo.items) {
    if (![item.cantidad, item.precioUnitario, item.descuento ?? 0, item.porcentajeItbis ?? 0].every(Number.isFinite)
      || item.cantidad <= 0 || item.precioUnitario < 0 || Number(item.descuento || 0) < 0 || Number(item.porcentajeItbis || 0) < 0) throw new Error('ACCOUNT_INVALID_ITEM');
    if (item.origen === 'cita') throw new Error('ACCOUNT_CATALOG_ONLY');
  }
  const items = consumo.items.map(recalcularConsumo);
  const subtotal = Number(items.reduce((sum, item) => sum + (item.subtotal || 0), 0).toFixed(2));
  const impuesto = Number(items.reduce((sum, item) => sum + (item.itbis || 0), 0).toFixed(2));
  const total = Math.max(0, Number((subtotal - consumo.descuentoGlobal + impuesto).toFixed(2)));
  return { ...consumo, clienteNombre: consumo.clienteNombre.trim(), items, subtotal, impuesto, total };
}

export function validarCuentaAbierta(cuenta: CuentaAbierta | undefined, version: number): asserts cuenta is CuentaAbierta {
  if (!cuenta || cuenta.estado !== 'abierta') throw new Error('ACCOUNT_NOT_OPEN');
  if (cuenta.version !== version) throw new Error('ACCOUNT_CONFLICT');
}

export function cuentaCoincideConFactura(cuenta: CuentaAbierta, factura: Omit<Factura, 'numero' | 'estado'>): boolean {
  const firma = (items: FacturaItem[]) => JSON.stringify(items.map(item => [
    item.productoServicioId || '', item.descripcion, item.tipo || '', item.cantidad, item.precioUnitario,
    item.descuento || 0, !!item.aplicaItbis, item.porcentajeItbis || 0, item.costoUnitario || 0, !!item.manejaInventario,
  ]));
  return cuenta.total === factura.total && cuenta.subtotal === factura.subtotal && cuenta.impuesto === factura.impuesto
    && cuenta.descuentoGlobal === (factura.descuentoTotal || 0) && cuenta.clienteNombre === factura.clienteNombre
    && cuenta.clienteId === (factura.clienteId || '') && firma(cuenta.items) === firma(factura.items);
}

export function precuentaDocumento(cuenta: CuentaAbierta): Factura {
  return {
    numero: cuenta.id, clienteId: cuenta.clienteId || undefined, clienteNombre: cuenta.clienteNombre,
    items: cuenta.items, subtotal: cuenta.subtotal, descuentoTotal: cuenta.descuentoGlobal,
    impuesto: cuenta.impuesto, itbisTotal: cuenta.impuesto, total: cuenta.total,
    estado: 'borrador', tipoDocumento: 'precuenta', cuentaAbiertaId: cuenta.id,
    fecha: cuenta.creadaEn, creadaPor: cuenta.creadaPor, artistaId: cuenta.creadaPor, artistaNombre: '',
  };
}
