import { Compra } from '../models/compra.model';

const formatDate = (value: unknown): string => {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-DO');
};

export function buildComprasExcelRows(compras: Compra[]): Record<string, string | number>[] {
  return compras.map((compra) => ({
    Fecha: formatDate(compra.fechaEmision),
    Proveedor: compra.proveedorNombre,
    RNC: compra.proveedorRnc || '',
    NCF: compra.ncf || '',
    Factura: compra.numeroFactura || '',
    CondicionPago: compra.condicionPago,
    Estado: compra.estado,
    Subtotal: compra.subtotal || 0,
    Descuento: compra.totalDescuento || 0,
    ITBIS: compra.totalItbis || 0,
    ImpuestosAdicionales: compra.totalImpuestosAdicionales || 0,
    Total: compra.total || 0,
    Moneda: compra.moneda || 'DOP',
  }));
}
