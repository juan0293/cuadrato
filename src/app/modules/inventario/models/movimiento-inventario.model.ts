export type TipoMovimientoInventario =
  | 'entrada'
  | 'salida'
  | 'entrada_compra'
  | 'anulacion_compra'
  | 'salida_venta'
  | 'decomiso'
  | 'averia'
  | 'vencimiento'
  | 'uso_interno'
  | 'robo'
  | 'perdida'
  | 'merma'
  | 'ajuste_fisico';

export interface MovimientoInventario {
  id?: string;
  // Compatibilidad legacy
  insumoId?: string;
  insumoNombre?: string;
  tipo?: 'entrada' | 'salida';
  artistaId?: string;
  citaId?: string;

  // Campos fiscal-ready
  productoId?: string;
  productoNombre?: string;
  tipoMovimiento?: TipoMovimientoInventario;
  cantidad: number;
  costoUnitario?: number;
  costoTotal?: number;
  referenciaTipo?: string;
  referenciaId?: string;
  motivo?: string;
  evidenciaUrl?: string;
  stockAnterior?: number;
  stockNuevo?: number;
  creadoPor: string;
  fecha: string;
}
