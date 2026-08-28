import { MovimientoFinanciero } from '../models/movimiento-financiero.model';

export const categoriasIngreso = ['tatuaje', 'retoque', 'venta-insumo', 'otros-ingresos'];
export const categoriasGasto = ['insumos', 'renta', 'servicios', 'marketing', 'otros-gastos'];

export const agruparPorCategoria = (items: MovimientoFinanciero[]): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, item) => {
    acc[item.categoria] = (acc[item.categoria] ?? 0) + item.monto;
    return acc;
  }, {});

export const agruparPorArtista = (items: MovimientoFinanciero[]): Record<string, number> =>
  items
    .filter((item) => !!item.artistaId)
    .reduce<Record<string, number>>((acc, item) => {
      const key = item.artistaId as string;
      acc[key] = (acc[key] ?? 0) + item.monto;
      return acc;
    }, {});
