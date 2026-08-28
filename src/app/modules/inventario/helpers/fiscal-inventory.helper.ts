import { ProductoServicio } from '../models/producto-servicio.model';
import { CatalogoFiscalService } from '../services/catalogo-fiscal.service';

/**
 * Aplica defaults fiscales de RD sobre el ítem para reducir errores
 * de captura manual en etapas tempranas del MVP.
 */
export const applyFiscalDefaults = (
  payload: ProductoServicio,
  catalogoFiscalService: CatalogoFiscalService,
): ProductoServicio => {
  const taxConfig = catalogoFiscalService.resolveTaxByIndicador(payload.indicadorFacturacion);
  const indicadorBienServicioECF = catalogoFiscalService.resolveIndicadorBienServicio(payload.tipoItem);

  return {
    ...payload,
    tasaItbis: taxConfig.tasaItbis,
    esExento: taxConfig.esExento,
    esNoFacturable: !taxConfig.esFacturable,
    indicadorBienServicioECF,
  };
};
