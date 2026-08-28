/**
 * Formatea montos para presentación en pesos dominicanos (RD$).
 * Esta utilidad es solo de UI/PDF; en base de datos se guardan números limpios.
 */
export function formatDopCurrency(value: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
