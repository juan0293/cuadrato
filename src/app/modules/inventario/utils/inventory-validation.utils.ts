import { ProductoServicio } from '../models/producto-servicio.model';

/**
 * Reglas mínimas para no generar ítems inconsistentes antes de llegar
 * a compras, movimientos y facturación.
 */
export const validateProductoServicio = (item: ProductoServicio): string[] => {
  const errors: string[] = [];

  if (!item.codigoInterno?.trim()) errors.push('Código interno requerido.');
  if (!item.nombre?.trim()) errors.push('Nombre requerido.');
  if (!item.categoriaId?.trim()) errors.push('Selecciona una categoría.');

  if (item.tipoItem === 'servicio' && item.manejaInventario) {
    errors.push('Un servicio no puede manejar inventario.');
  }

  if (item.manejaInventario) {
    if (!item.unidadMedidaId) errors.push('Selecciona una unidad de medida.');
    if (item.stockMinimo === undefined) errors.push('El stock mínimo es requerido para ítems inventariables.');
  }

  if (Number(item.precioCompra || 0) < 0) {
    errors.push('El precio de compra no puede ser negativo.');
  }

  if (item.esNoFacturable && item.indicadorFacturacion !== 0) {
    errors.push('Un ítem no facturable debe usar indicador 0.');
  }

  return errors;
};
