import { Factura } from '../models/factura.model';
import { aplicarPagoAFactura, desglosarPagosFactura } from './pagos-factura.helper';

describe('Distribución de pagos y efectivo neto', () => {
  it('no resta nuevamente la devuelta de un efectivo ya aplicado a la factura', () => {
    const factura = { total: 195, formaPago: 'efectivo', montoPagado: 200, devuelta: 5,
      pagos: { efectivo: 195, tarjeta: 0, transferencia: 0, credito: 0 } } as Factura;
    expect(desglosarPagosFactura(factura).efectivo).toBe(195);
  });

  it('compatibiliza pagos históricos brutos sin reducir los comprobantes de otros medios', () => {
    const factura = { total: 1000, formaPago: 'mixto', devuelta: 100,
      pagos: { efectivo: 600, tarjeta: 300, transferencia: 200, credito: 0 } } as Factura;
    expect(desglosarPagosFactura(factura)).toEqual({ efectivo: 500, tarjeta: 300, transferencia: 200, credito: 0 });
    expect(desglosarPagosFactura({ ...factura, pagos: { ...factura.pagos!, efectivo: 500 } }).efectivo).toBe(500);
  });

  it('el crédito sigue siendo crédito aunque un documento antiguo tenga totalPagado incorrecto', () => {
    const factura = { total: 200, formaPago: 'credito', totalPagado: 200, montoPagado: 200,
      pagos: { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 200, totalPagadoAhora: 0 } } as Factura;
    expect(desglosarPagosFactura(factura)).toEqual({ efectivo: 0, tarjeta: 0, transferencia: 0, credito: 200 });
  });

  it('mantiene compatibilidad con facturas sin desglose y métodos con tildes', () => {
    expect(desglosarPagosFactura({ total: 120, formaPago: 'crédito' } as any).credito).toBe(120);
    expect(desglosarPagosFactura({ total: 150, formaPago: 'transferencia' } as Factura).efectivo).toBe(0);
  });

  it('devuelve el excedente del efectivo sin prorratearlo entre tarjeta y transferencia', () => {
    expect(aplicarPagoAFactura({ efectivo: 600, tarjeta: 300, transferencia: 200, credito: 0,
      totalPagadoAhora: 1100, totalRegistrado: 1100, diferencia: -100 }, 1000)).toEqual({
        efectivo: 500, tarjeta: 300, transferencia: 200, credito: 0, totalPagadoAhora: 1000,
        totalRegistrado: 1000, diferencia: 0, montosAplicados: true,
      });
  });

  it('rechaza un excedente que no puede devolverse del efectivo recibido', () => {
    expect(() => aplicarPagoAFactura({ efectivo: 0, tarjeta: 0, transferencia: 1100, credito: 0,
      totalPagadoAhora: 1100, totalRegistrado: 1100, diferencia: -100 }, 1000)).toThrowError('CHANGE_EXCEEDS_CASH');
  });
});
