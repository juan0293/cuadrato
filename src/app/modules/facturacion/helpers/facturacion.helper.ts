export const generarNumeroFactura = (secuencia: number): string => `VT-${String(secuencia).padStart(6, '0')}`;

export const estadoFacturaLabel = (estado: 'borrador' | 'emitida' | 'anulada' | 'pagada'): string => {
  if (estado === 'borrador') return 'Borrador';
  if (estado === 'emitida') return 'Emitida';
  if (estado === 'anulada') return 'Anulada';
  return 'Pagada';
};

export const estadoFacturaColor = (estado: 'borrador' | 'emitida' | 'anulada' | 'pagada'): string => {
  if (estado === 'borrador') return 'medium';
  if (estado === 'emitida') return 'primary';
  if (estado === 'anulada') return 'danger';
  return 'success';
};
