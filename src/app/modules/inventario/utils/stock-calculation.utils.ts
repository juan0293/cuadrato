export const calcularStockDisponible = (stockActual: number, cantidad: number, tipo: 'entrada' | 'salida'): number =>
  tipo === 'entrada' ? stockActual + cantidad : stockActual - cantidad;

export const esStockBajo = (stockActual: number, stockMinimo: number): boolean => stockActual <= stockMinimo;
