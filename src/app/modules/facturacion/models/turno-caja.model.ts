export const DENOMINACIONES_DOP = [1, 5, 10, 25, 50, 100, 200, 500, 1000, 2000] as const;

export interface DesgloseEfectivo {
  denominacion: number;
  cantidad: number;
}

export function normalizarDesgloseEfectivo(items: DesgloseEfectivo[]): DesgloseEfectivo[] {
  return DENOMINACIONES_DOP.map((denominacion) => {
    const cantidad = Number(items.find((item) => item.denominacion === denominacion)?.cantidad ?? 0);
    if (!Number.isSafeInteger(cantidad) || cantidad < 0) throw new Error('INVALID_CASH_COUNT');
    return { denominacion, cantidad };
  });
}

export function totalDesgloseEfectivo(items: DesgloseEfectivo[]): number {
  return items.reduce((total, item) => total + item.denominacion * item.cantidad, 0);
}

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
  // Ausente en cierres históricos: incluían el fondo inicial. Los nuevos
  // cierres registran explícitamente si el fondo se contó o se maneja aparte.
  fondoInicialIncluidoEnConteo?: boolean;
  desgloseEfectivo?: DesgloseEfectivo[];
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
