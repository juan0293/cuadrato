import { CompraItem } from '../models/compra-item.model';
import { Compra } from '../models/compra.model';
import { ProductoServicio } from '../models/producto-servicio.model';
import { Proveedor } from '../models/proveedor.model';
import { Utilidad } from '../models/utilidad.model';
import { calculateSalePrice } from '../utils/purchase-calculation.utils';
import { calculateCompraItemItbis, calculateCompraItemSubtotal, calculateCompraItemTotal } from '../utils/purchase-calculation.utils';
import { calculateAdditionalTaxes } from '../utils/tax-calculation.utils';

export const mapProductoToCompraItem = (
  producto: ProductoServicio,
  cantidad: number,
  precioCompra: number,
  descuento = 0,
  utilidad?: Utilidad,
): CompraItem => {
  const subtotal = calculateCompraItemSubtotal(cantidad, precioCompra, descuento);
  const montoItbis = calculateCompraItemItbis(subtotal, producto.tasaItbis);

  const base: CompraItem = {
    productoId: producto.id as string,
    codigoInterno: producto.codigoInterno,
    nombre: producto.nombre,
    tipoItem: producto.tipoItem,
    manejaInventario: producto.manejaInventario,
    categoriaId: producto.categoriaId,
    categoriaNombre: producto.categoriaNombre,
    proveedorId: producto.proveedorId,
    proveedorNombre: producto.proveedorNombre,
    proveedorRnc: producto.proveedorRnc,
    cantidad,
    unidadMedidaId: producto.unidadMedidaId,
    unidadMedidaCodigo: producto.unidadMedidaCodigo,
    unidadMedidaNombre: producto.unidadMedidaNombre,
    precioCompra,
    costoUnitario: precioCompra,
    utilidadId: utilidad?.id || producto.utilidadId,
    utilidadNombre: utilidad?.nombre || producto.utilidadNombre,
    utilidadPorcentaje: Number(utilidad?.porcentaje ?? producto.utilidadPorcentaje ?? 0),
    precioVentaSugerido: calculateSalePrice(precioCompra, Number(utilidad?.porcentaje ?? producto.utilidadPorcentaje ?? 0)),
    descuento,
    indicadorBienServicioECF: producto.indicadorBienServicioECF,
    indicadorFacturacion: producto.indicadorFacturacion,
    tasaItbis: producto.tasaItbis,
    montoItbis,
    impuestosAdicionales: producto.impuestosAdicionales || [],
    subtotal,
    montoImpuestosAdicionales: 0,
    total: 0,
  };

  base.montoImpuestosAdicionales = calculateAdditionalTaxes(base);
  base.total = calculateCompraItemTotal(base.subtotal, base.montoItbis, base.montoImpuestosAdicionales);
  return base;
};

export const mapProveedorToCompra = (proveedor: Proveedor): Pick<Compra, 'proveedorId' | 'proveedorNombre' | 'proveedorRnc' | 'condicionPago' | 'moneda'> => ({
  proveedorId: proveedor.id as string,
  proveedorNombre: proveedor.nombre,
  proveedorRnc: proveedor.rnc,
  condicionPago: proveedor.condicionesPagoDefault || 'contado',
  moneda: (proveedor.monedaDefault || 'DOP') as Compra['moneda'],
});

export const validateCompraBeforeConfirm = (compra: Compra): string[] => {
  const errors: string[] = [];
  if (!compra.proveedorId) errors.push('Selecciona un proveedor.');
  if (!compra.numeroFactura) errors.push('Número de factura requerido.');
  if (!compra.fechaEmision) errors.push('Fecha de emisión requerida.');
  if (!compra.items?.length) errors.push('Agrega al menos un producto o servicio.');
  if (compra.condicionPago === 'credito' && !compra.fechaVencimiento) errors.push('Fecha de vencimiento requerida para compras a crédito.');
  return errors;
};

export const detectProductosDeOtroProveedor = (items: CompraItem[], proveedorId?: string): boolean => {
  if (!proveedorId) return false;
  return items.some((item) => !!item.proveedorId && item.proveedorId !== proveedorId);
};
