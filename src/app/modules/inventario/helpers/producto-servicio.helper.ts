import { IndicadorFacturacion } from '../models/producto-servicio.model';

export function mapIndicadorFacturacion(indicador: IndicadorFacturacion): { tasaItbis: 0 | 16 | 18; esExento: boolean; esNoFacturable: boolean } {
  switch (indicador) {
    case 1:
      return { tasaItbis: 18, esExento: false, esNoFacturable: false };
    case 2:
      return { tasaItbis: 16, esExento: false, esNoFacturable: false };
    case 3:
      return { tasaItbis: 0, esExento: false, esNoFacturable: false };
    case 4:
      return { tasaItbis: 0, esExento: true, esNoFacturable: false };
    case 0:
    default:
      return { tasaItbis: 0, esExento: false, esNoFacturable: true };
  }
}
