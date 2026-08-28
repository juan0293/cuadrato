import { ImpuestoAdicionalProducto } from './impuesto-adicional-producto.model';

export type TipoItemInventario = 'bien' | 'servicio';
export type IndicadorBienServicioECF = 1 | 2;
export type IndicadorFacturacion = 0 | 1 | 2 | 3 | 4;

export interface ProductoServicio {
  id?: string;
  codigoInterno: string;
  nombre: string;
  descripcion?: string;
  tipoItem: TipoItemInventario;
  manejaInventario: boolean;
  categoriaId: string;
  categoriaNombre: string;
  unidadMedidaId?: string;
  unidadMedidaCodigo?: string;
  unidadMedidaNombre?: string;
  utilidadId?: string;
  utilidadNombre?: string;
  utilidadPorcentaje?: number;
  proveedorId?: string;
  proveedorNombre?: string;
  proveedorRnc?: string;
  proveedorTelefono?: string;
  proveedorEmail?: string;
  moneda: string;
  stockActual: number;
  stockMinimo?: number;
  stockMaximo?: number;
  costoPromedio?: number;
  ultimoCosto?: number;
  precioCompra?: number;
  precioVenta: number;
  precioVentaEditadoManual?: boolean;
  indicadorBienServicioECF: IndicadorBienServicioECF;
  indicadorFacturacion: IndicadorFacturacion;
  tasaItbis: 0 | 16 | 18;
  esExento: boolean;
  esNoFacturable: boolean;
  impuestosAdicionales?: ImpuestoAdicionalProducto[];
  activo: boolean;
  creadoPor: string;
  fechaCreacion: unknown;
  actualizadoPor?: string;
  fechaActualizacion?: unknown;
}
