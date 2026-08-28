import { ImpuestoAdicionalProducto } from './impuesto-adicional-producto.model';
import { IndicadorFacturacion, IndicadorBienServicioECF } from './producto-servicio.model';

export interface EcfLineDraft {
  numeroLinea: number;
  nombreItem: string;
  indicadorBienServicio: IndicadorBienServicioECF;
  indicadorFacturacion: IndicadorFacturacion;
  cantidad: number;
  unidadMedida?: string;
  precioUnitario: number;
  montoDescuento: number;
  montoRecargo: number;
  montoItem: number;
  tasaItbis: 0 | 16 | 18;
  montoItbis: number;
  impuestosAdicionales?: ImpuestoAdicionalProducto[];
}
