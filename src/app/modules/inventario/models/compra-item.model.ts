import { ImpuestoAdicionalProducto } from './impuesto-adicional-producto.model';
import { IndicadorBienServicioECF, IndicadorFacturacion } from './producto-servicio.model';

export interface CompraItem {
  productoId: string;
  codigoInterno: string;
  nombre: string;
  tipoItem: 'bien' | 'servicio';
  manejaInventario: boolean;
  categoriaId?: string;
  categoriaNombre?: string;
  proveedorId?: string;
  proveedorNombre?: string;
  proveedorRnc?: string;
  cantidad: number;
  unidadMedidaId?: string;
  unidadMedidaCodigo?: string;
  unidadMedidaNombre?: string;
  precioCompra: number;
  costoUnitario: number;
  utilidadId?: string;
  utilidadNombre?: string;
  utilidadPorcentaje?: number;
  precioVentaSugerido?: number;
  actualizarPrecioVentaProducto?: boolean;
  actualizarUtilidadProducto?: boolean;
  descuento?: number;
  indicadorBienServicioECF: IndicadorBienServicioECF;
  indicadorFacturacion: IndicadorFacturacion;
  tasaItbis: 0 | 16 | 18;
  montoItbis: number;
  impuestosAdicionales?: ImpuestoAdicionalProducto[];
  subtotal: number;
  montoImpuestosAdicionales: number;
  total: number;
}
