import { FormBuilder } from '@angular/forms';
import { FacturacionPage } from './facturacion.page';
import { DENOMINACIONES_DOP } from '../models/turno-caja.model';
import { desglosarPagosFactura } from '../helpers/pagos-factura.helper';

describe('Facturación: conteo separado del fondo y pagos aplicados', () => {
  let page: FacturacionPage;
  beforeEach(() => {
    const fb = new FormBuilder().nonNullable;
    page = Object.create(FacturacionPage.prototype);
    Object.assign(page, {
      turnoActivo: { id: 'turno', estado: 'abierto', montoInicial: 2000 },
      turnoTotales: { totalVentas: 3880, totalEfectivo: 1970, totalTarjeta: 0, totalTransferencia: 1310, totalCredito: 600 },
      denominacionesCierre: DENOMINACIONES_DOP,
      cierreTurnoForm: fb.group({ usarDesglose: [true], incluirFondoInicial: [false],
        cantidades: fb.array(DENOMINACIONES_DOP.map(denominacion => fb.control(({ 5: 4, 25: 1, 50: 1, 100: 7, 200: 3, 500: 1 } as Record<number, number>)[denominacion] || 0))),
        efectivoContado: [1895], observacionCierre: [''],
      }),
      facturaForm: fb.group({ clienteId: [''], citaId: [''], descuentoGlobal: [0], formaPago: ['efectivo'], tipoComprobante: ['B02'], origen: ['manual'] }),
      clientes: [], cartItems: [{ descripcion: 'Consumo', cantidad: 1, precioUnitario: 195, subtotal: 195, total: 195, itbis: 0 }],
    });
  });

  it('compara solo ventas en efectivo con conteo y permite contar monedas de RD$10', () => {
    expect(page.efectivoEsperadoCierre).toBe(1970);
    expect(page.totalContadoCierre).toBe(1895);
    expect(page.diferenciaCierre).toBe(-75);
    page.cierreTurnoForm.controls.cantidades.at(DENOMINACIONES_DOP.indexOf(10)).setValue(5);
    page.cierreTurnoForm.controls.cantidades.at(DENOMINACIONES_DOP.indexOf(25)).setValue(2);
    expect(page.totalContadoCierre).toBe(1970);
    expect(page.diferenciaCierre).toBe(0);
  });

  it('solo suma el fondo inicial cuando se habilita el conteo conjunto', () => {
    page.cierreTurnoForm.controls.incluirFondoInicial.setValue(true);
    expect(page.efectivoEsperadoCierre).toBe(3970);
    page.cierreTurnoForm.controls.incluirFondoInicial.setValue(false);
    page.cierreTurnoForm.controls.usarDesglose.setValue(false);
    expect(page.totalContadoCierre).toBe(1895);
    expect(page.efectivoEsperadoCierre).toBe(1970);
  });

  it('consulta las facturas actuales antes de mostrar el cierre y evita usar un resumen anterior', async () => {
    const totales = { ...page.turnoTotales };
    page.turnoTotales.totalEfectivo = 0;
    const calcular = jasmine.createSpy().and.resolveTo(totales);
    (page as any).turnosCajaService = { calcularTotalesTurno: calcular };
    await page.abrirModalCierreTurno();
    expect(calcular).toHaveBeenCalledOnceWith('turno');
    expect(page.showCierreTurnoModal).toBeTrue();
    expect(page.efectivoEsperadoCierre).toBe(1970);
    expect(page.turnoActionLoading).toBeFalse();
  });

  it('guarda el efectivo aplicado separado del recibido sin volver a restar la devuelta', () => {
    const payload = (page as any).buildFacturaPayload('u', 'emitida', 200);
    expect(payload.pagos.efectivo).toBe(195);
    expect(payload.pagos.montosAplicados).toBeTrue();
    expect(payload.totalPagado).toBe(195);
    expect(payload.montoPagado).toBe(200);
    expect(payload.devuelta).toBe(5);
    expect(desglosarPagosFactura(payload).efectivo).toBe(195);
  });

  it('guarda cero cobrado en una factura totalmente a crédito', () => {
    page.facturaForm.controls.formaPago.setValue('credito');
    const payload = (page as any).buildFacturaPayload('u', 'emitida', 0);
    expect(payload.totalPagado).toBe(0);
    expect(payload.montoPagado).toBe(0);
    expect(payload.pagos.totalPagadoAhora).toBe(0);
    expect(payload.pagos.totalCredito).toBe(195);
    expect(payload.estadoPago).toBe('credito');
    expect(payload.fechaPago).toBeUndefined();
  });
});
