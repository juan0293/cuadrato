export function calculateSalePrice(precioCompra: number, utilidadPorcentaje: number): number {
  const compra = Number(precioCompra || 0);
  const utilidad = Number(utilidadPorcentaje || 0);
  return Number((compra + (compra * utilidad / 100)).toFixed(2));
}
