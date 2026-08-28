export interface TurnoCaja {
  id?: string;
  numeroTurno: string;
  cajaId: string;
  cajaNombre: string;
  usuarioId: string;
  usuarioNombre: string;
  fechaApertura?: any;
  fechaCierre?: any | null;
  montoInicial: number;
  efectivoEsperado: number;
  efectivoContado?: number | null;
  diferencia?: number | null;
  totalVentas: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalCredito: number;
  cantidadFacturas: number;
  estado: 'abierto' | 'cerrado';
  observacionApertura?: string;
  observacionCierre?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TurnoTotales {
  totalVentas: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalCredito: number;
  cantidadFacturas: number;
}
