import { CompraItem } from '../models/compra-item.model';
import { EcfLineDraft } from '../models/ecf-line-draft.model';

/**
 * Mapper intermedio e-CF ready: transforma ítems internos a líneas fiscales
 * neutrales sin generar XML en esta fase.
 */
export const toEcfLineDraft = (item: CompraItem, index: number): EcfLineDraft => {
  return {
    numeroLinea: index + 1,
    nombreItem: item.nombre,
    indicadorBienServicio: item.indicadorBienServicioECF,
    indicadorFacturacion: item.indicadorFacturacion,
    cantidad: item.cantidad,
    unidadMedida: item.unidadMedidaCodigo,
    precioUnitario: item.costoUnitario,
    montoDescuento: item.descuento || 0,
    montoRecargo: 0,
    montoItem: item.subtotal,
    tasaItbis: item.tasaItbis,
    montoItbis: item.montoItbis,
    impuestosAdicionales: item.impuestosAdicionales,
  };
};

export const toEcfLineDraftList = (items: CompraItem[]): EcfLineDraft[] => {
  return items.map((item, index) => toEcfLineDraft(item, index));
};

/**
 * Validación mínima de integridad para evitar enviar líneas defectuosas
 * a futuras capas de emisión e-CF.
 */
export const validateEcfLineDraft = (line: EcfLineDraft): string[] => {
  const errors: string[] = [];

  if (!line.nombreItem?.trim()) errors.push('NOMBRE_ITEM_REQUIRED');
  if (!(line.cantidad > 0)) errors.push('CANTIDAD_INVALID');
  if (!(line.precioUnitario >= 0)) errors.push('PRECIO_UNITARIO_INVALID');
  if (!(line.montoItem >= 0)) errors.push('MONTO_ITEM_INVALID');
  if (![0, 16, 18].includes(line.tasaItbis)) errors.push('TASA_ITBIS_INVALID');
  if (![0, 1, 2, 3, 4].includes(line.indicadorFacturacion)) errors.push('INDICADOR_FACTURACION_INVALID');
  if (![1, 2].includes(line.indicadorBienServicio)) errors.push('INDICADOR_BIEN_SERVICIO_INVALID');

  return errors;
};

export const validateEcfDraftBatch = (lines: EcfLineDraft[]): { line: number; errors: string[] }[] => {
  return lines
    .map((line) => ({ line: line.numeroLinea, errors: validateEcfLineDraft(line) }))
    .filter((result) => result.errors.length > 0);
};
