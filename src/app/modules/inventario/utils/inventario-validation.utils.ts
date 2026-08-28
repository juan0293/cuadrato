export const validarCantidadMovimiento = (cantidad: number): boolean => Number.isFinite(cantidad) && cantidad > 0;

export const validarStockNoNegativo = (stock: number): boolean => stock >= 0;
