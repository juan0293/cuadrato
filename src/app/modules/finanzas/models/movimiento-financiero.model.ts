export interface EvidenciaMovimiento {
  nombre: string;
  tipo: string;
  url: string;
  path: string;
  size: number;
  fecha: string;
}

export interface MovimientoFinanciero {
  id?: string;
  tipo: 'ingreso' | 'gasto';
  categoria: string;
  monto: number;
  descripcion: string;
  artistaId?: string;
  citaId?: string;
  facturaId?: string;
  fecha: string;
  creadoPor: string;
  evidencias?: EvidenciaMovimiento[];
}

export type FiltroPeriodoFinanciero = 'diario' | 'semanal' | 'mensual' | 'anual';
