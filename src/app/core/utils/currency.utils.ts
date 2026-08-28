const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const cleaned = raw.replace(/rd\$/gi, '').replace(/\s/g, '');
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalPos = Math.max(lastDot, lastComma);

  let normalized = cleaned;
  if (decimalPos >= 0) {
    const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, '');
    const decPart = cleaned.slice(decimalPos + 1).replace(/[^\d]/g, '');
    normalized = `${intPart}.${decPart}`;
  } else {
    normalized = cleaned.replace(/[^\d-]/g, '');
  }

  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrencyDOP = (value: unknown): string =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    maximumFractionDigits: 2,
  }).format(toSafeNumber(value));
