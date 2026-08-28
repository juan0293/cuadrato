import { CompraItem } from '../models/compra-item.model';

export const calculateItbis = (baseAmount: number, tasaItbis: 0 | 16 | 18): number => {
  if (tasaItbis <= 0) return 0;
  return Number(((baseAmount * tasaItbis) / 100).toFixed(2));
};

export const calculateAdditionalTaxes = (item: CompraItem): number => {
  return Number(
    (item.impuestosAdicionales ?? [])
      .reduce((acc, tax) => acc + (((item.subtotal || 0) * (tax.tasa || 0)) / 100), 0)
      .toFixed(2),
  );
};
