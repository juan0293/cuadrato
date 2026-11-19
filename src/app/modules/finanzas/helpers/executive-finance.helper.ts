import { Factura } from '../../facturacion/models/factura.model';
import { MovimientoFinanciero } from '../models/movimiento-financiero.model';

export interface ExecutivePeriod {
  invoices: number;
  grossSales: number | null;
  netSales: number | null;
  invoiced: number;
  taxes: number | null;
  discounts: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  expenses: number;
  otherIncome: number;
  knownCostLines: number;
  totalLines: number;
  missingDetailInvoices: number;
  categories: { labels: string[]; values: number[] };
}

export interface ExecutiveComparison { absolute: number | null; percent: number | null; }
export interface ExecutiveDashboard {
  current: ExecutivePeriod;
  previous: ExecutivePeriod | null;
  previousLabel: string;
  changes: { grossSales: ExecutiveComparison; netSales: ExecutiveComparison; grossProfit: ExecutiveComparison; grossMargin: ExecutiveComparison };
  timeline: { labels: string[]; sales: Array<number | null>; profit: Array<number | null> };
  comparison: Array<number | null>;
  hasData: boolean;
  invalidDates: number;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function financeDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = typeof (value as any)?.toDate === 'function' ? (value as any).toDate() : value;
  const date = raw instanceof Date ? raw : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? `${raw}T00:00:00` : String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}
export function inFinanceRange(value: unknown, from: string, to: string): boolean {
  const date = financeDate(value);
  const start = from ? financeDate(from) : null;
  const end = to ? financeDate(`${to}T23:59:59.999`) : null;
  return !!date && (!start || date >= start) && (!end || date <= end);
}
const isSale = (f: Factura) => f.estado === 'emitida' || f.estado === 'pagada';

export function summarizeExecutivePeriod(invoices: Factura[], movements: MovimientoFinanciero[]): ExecutivePeriod {
  let gross = 0, net = 0, taxes = 0, invoiced = 0, costs = 0, known = 0, lines = 0, missing = 0;
  let grossComplete = true, netComplete = true, costComplete = true;
  const categories = new Map<string, number>();
  for (const invoice of invoices.filter(isSale)) {
    const tax = invoice.itbisTotal ?? invoice.impuesto;
    const validNet = finite(invoice.total) && finite(tax) && tax >= 0 && invoice.total >= tax;
    const invoiceNet = validNet ? round(invoice.total - tax) : 0;
    invoiced += finite(invoice.total) ? invoice.total : 0;
    if (validNet) { net += invoiceNet; taxes += tax; } else netComplete = false;
    if (!invoice.items?.length) {
      missing += 1;
      grossComplete = costComplete = false;
      if (validNet) categories.set('Sin detalle de productos', (categories.get('Sin detalle de productos') || 0) + invoiceNet);
      continue;
    }
    let invoiceGross = 0;
    const weights: Array<{ category: string; amount: number }> = [];
    let validLines = true;
    for (const item of invoice.items) {
      lines += 1;
      if (!finite(item.cantidad) || item.cantidad <= 0 || !finite(item.precioUnitario) || item.precioUnitario < 0) {
        grossComplete = costComplete = validLines = false;
        continue;
      }
      invoiceGross += item.cantidad * item.precioUnitario;
      const weight = finite(item.subtotal) ? item.subtotal : item.cantidad * item.precioUnitario - (finite(item.descuento) ? item.descuento : 0);
      weights.push({ category: item.categoria?.trim() || 'Sin categoría', amount: Math.max(0, weight) });
      // En el POS un costo ausente también puede guardarse como 0. No permite
      // distinguir gratuidad validada de falta de costeo (especialmente servicios).
      if (finite(item.costoUnitario) && item.costoUnitario > 0) {
        costs += item.cantidad * item.costoUnitario;
        known += 1;
      } else costComplete = false;
    }
    gross += invoiceGross;
    if (validNet && round(invoiceGross) + 0.02 < invoiceNet) grossComplete = false;
    if (validNet) {
      const totalWeight = weights.reduce((sum, entry) => sum + entry.amount, 0);
      if (!validLines || totalWeight <= 0) {
        categories.set('Sin detalle de productos', (categories.get('Sin detalle de productos') || 0) + invoiceNet);
      } else {
        // Distribuye el descuento global proporcionalmente sin descontar otra
        // vez descuentos por línea; el último registro absorbe el redondeo.
        let allocated = 0;
        weights.forEach((entry, index) => {
          const amount = index === weights.length - 1 ? round(invoiceNet - allocated) : round(invoiceNet * entry.amount / totalWeight);
          allocated = round(allocated + amount);
          categories.set(entry.category, (categories.get(entry.category) || 0) + amount);
        });
      }
    }
  }
  const saleCount = invoices.filter(isSale).length;
  const costOfSales = costComplete && missing === 0 ? round(costs) : null;
  const netSales = netComplete ? round(net) : null;
  const grossSales = grossComplete ? round(gross) : null;
  const grossProfit = netSales !== null && costOfSales !== null ? round(netSales - costOfSales) : null;
  const ordered = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  const main = ordered.slice(0, 7);
  if (ordered.length > 7) main.push(['Otras categorías', ordered.slice(7).reduce((sum, entry) => sum + entry[1], 0)]);
  return {
    invoices: saleCount, grossSales, netSales, invoiced: round(invoiced), taxes: netComplete ? round(taxes) : null,
    discounts: grossSales !== null && netSales !== null ? round(Math.max(0, grossSales - netSales)) : null,
    costOfSales, grossProfit, grossMargin: netSales !== null && netSales > 0 && grossProfit !== null ? round(grossProfit / netSales * 100) : null,
    knownCostLines: known, totalLines: lines, missingDetailInvoices: missing,
    expenses: round(movements.filter(m => m.tipo === 'gasto').reduce((sum, m) => sum + (finite(m.monto) ? m.monto : 0), 0)),
    otherIncome: round(movements.filter(m => m.tipo === 'ingreso' && !m.facturaId && String(m.categoria).trim().toLowerCase() !== 'facturacion')
      .reduce((sum, m) => sum + (finite(m.monto) ? m.monto : 0), 0)),
    categories: { labels: main.map(entry => entry[0]), values: netComplete ? main.map(entry => round(entry[1])) : [] },
  };
}

export function compareExecutive(current: number | null, previous: number | null): ExecutiveComparison {
  if (current === null || previous === null) return { absolute: null, percent: null };
  return { absolute: round(current - previous), percent: previous > 0 ? round((current - previous) / previous * 100) : null };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildExecutiveDashboard(allInvoices: Factura[], movements: MovimientoFinanciero[], from: string, to: string): ExecutiveDashboard {
  const invoices = allInvoices.filter(isSale);
  const currentInvoices = invoices.filter(f => inFinanceRange(f.fecha || f.creadoEn, from, to));
  const currentMovements = movements.filter(m => inFinanceRange(m.fecha, from, to));
  const current = summarizeExecutivePeriod(currentInvoices, currentMovements);
  let previous: ExecutivePeriod | null = null;
  let previousLabel = 'Selecciona ambas fechas para comparar períodos de igual duración.';
  const start = financeDate(from), end = financeDate(to);
  if (start && end && start <= end) {
    const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
    const pFrom = dateKey(prevStart), pTo = dateKey(prevEnd);
    previous = summarizeExecutivePeriod(invoices.filter(f => inFinanceRange(f.fecha || f.creadoEn, pFrom, pTo)), movements.filter(m => inFinanceRange(m.fecha, pFrom, pTo)));
    const format = new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
    previousLabel = `${format.format(prevStart)} al ${format.format(prevEnd)} (${days} días)`;
  }
  const dates = currentInvoices.map(f => financeDate(f.fecha || f.creadoEn)!).sort((a, b) => a.getTime() - b.getTime());
  const first = start || dates[0], last = end || dates[dates.length - 1];
  const buckets = new Map<string, Factura[]>();
  if (first && last) {
    const monthly = (Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000 + 1 > 62;
    const key = (d: Date) => dateKey(d).slice(0, monthly ? 7 : 10);
    const cursor = new Date(first);
    cursor.setHours(0, 0, 0, 0);
    if (monthly) cursor.setDate(1);
    while (cursor <= last) {
      buckets.set(key(cursor), []);
      if (monthly) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
    }
    currentInvoices.forEach(f => buckets.get(key(financeDate(f.fecha || f.creadoEn)!))?.push(f));
  }
  const timelinePeriods = [...buckets.values()].map(items => summarizeExecutivePeriod(items, []));
  return {
    current, previous, previousLabel,
    changes: { grossSales: compareExecutive(current.grossSales, previous?.grossSales ?? null),
      netSales: compareExecutive(current.netSales, previous?.netSales ?? null), grossProfit: compareExecutive(current.grossProfit, previous?.grossProfit ?? null),
      grossMargin: compareExecutive(current.grossMargin, previous?.grossMargin ?? null) },
    timeline: { labels: [...buckets.keys()], sales: timelinePeriods.map(p => p.netSales), profit: timelinePeriods.map(p => p.grossProfit) },
    comparison: [current.netSales, current.costOfSales, current.expenses, current.otherIncome],
    hasData: currentInvoices.length > 0 || currentMovements.length > 0,
    invalidDates: invoices.filter(f => !financeDate(f.fecha || f.creadoEn)).length + movements.filter(m => !financeDate(m.fecha)).length,
  };
}
