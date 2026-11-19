import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { FacturacionPage } from './facturacion.page';
import { CuentaAbierta } from '../models/cuenta-abierta.model';
import { calcularCuenta } from '../helpers/cuenta-abierta.helper';

describe('Punto de venta: sesión de cuenta abierta', () => {
  let page: FacturacionPage;
  let server: CuentaAbierta;
  let guardar: jasmine.Spy;
  let print: jasmine.Spy;
  let errores: jasmine.Spy;
  const uid = 'cuentas-unit-test';
  const storageKey = `cuadrato.cuenta-pendiente.${uid}`;

  beforeEach(() => {
    localStorage.removeItem(storageKey);
    server = { ...calcularCuenta({ clienteNombre: 'Mesa Juan', clienteId: '', descuentoGlobal: 0,
      items: [{ productoServicioId: 'p1', descripcion: 'Bebida', cantidad: 1, precioUnitario: 100,
        aplicaItbis: true, porcentajeItbis: 18, costoUnitario: 40, manejaInventario: true, stockActual: 10, total: 118 }],
    }), id: 'cuenta-1', estado: 'abierta', version: 1, creadaEn: '2026-11-03T12:00:00', creadaPor: uid,
      actualizadaEn: '2026-11-03T12:00:00', actualizadaPor: uid };
    guardar = jasmine.createSpy().and.callFake(async (id, version, consumo) => {
      if (version !== server.version) throw new Error('ACCOUNT_CONFLICT');
      server = { ...server, ...calcularCuenta(consumo), version: version + 1 };
      return server;
    });
    print = jasmine.createSpy().and.resolveTo(); errores = jasmine.createSpy().and.resolveTo();
    page = Object.create(FacturacionPage.prototype);
    const fb = new FormBuilder().nonNullable;
    Object.assign(page, { cuentaActiva: null, cuentaUid: uid, cuentaEstado: 'guardada', cuentaActionBusy: false,
      isEmitting: false, cartItems: [], clientes: [], productos: [{ id: 'p1', stockActual: 10 }],
      facturaForm: fb.group({ clienteId: [''], citaId: [''], descuentoGlobal: [0], origen: ['manual'], formaPago: ['efectivo'], tipoComprobante: ['B02'] }),
      cobroForm: fb.group({ montoPagado: [0], efectivo: [0], tarjeta: [0], transferencia: [0], credito: [0] }),
      authService: { user$: of({ uid }) }, toastService: { error: errores, success: jasmine.createSpy().and.resolveTo() },
      invoicePrintingService: { printPrebill: print, getFriendlyError: () => 'No se pudo imprimir' },
      cuentasAbiertasService: { guardar, get: async () => server, crear: jasmine.createSpy().and.resolveTo(server) },
    });
    (page as any).cargarCuentaEnCarrito(server);
  });
  afterEach(() => localStorage.removeItem(storageKey));

  it('carga nombre libre y consumos, permite modificarlos y guarda sin factura', async () => {
    expect(page.cartItems[0].cantidad).toBe(1);
    expect(page.cuentaActiva!.clienteNombre).toBe('Mesa Juan');
    page.updateQuantity(page.cartItems[0], 2);
    await page.guardarCuentaActual();
    expect(server.items[0].cantidad).toBe(2);
    expect(server.total).toBe(236);
    expect(page.cuentaEstado).toBe('guardada');
    await page.guardarYSalirCuenta();
    expect(page.cuentaActiva).toBeNull();
    expect(server.estado).toBe('abierta');
    (page as any).cargarCuentaEnCarrito(server);
    expect(page.cartItems[0].cantidad).toBe(2);
  });

  it('serializa cambios rápidos usando la revisión devuelta por cada guardado', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => release = resolve);
    let calls = 0;
    guardar.and.callFake(async (_id, version, consumo) => {
      if (++calls === 1) await waiting;
      expect(version).toBe(server.version);
      server = { ...server, ...calcularCuenta(consumo), version: version + 1 };
      return server;
    });
    page.updateQuantity(page.cartItems[0], 2);
    page.updateQuantity(page.cartItems[0], 3);
    expect(localStorage.getItem(storageKey)).toContain('"cantidad":3');
    release();
    await page.guardarCuentaActual();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(server.version).toBe(3);
    expect(server.items[0].cantidad).toBe(3);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('conserva un respaldo de consumos al fallar y permite recuperarlo tras recargar', async () => {
    guardar.and.rejectWith(new Error('offline'));
    page.updateQuantity(page.cartItems[0], 4);
    await page.guardarCuentaActual();
    expect(page.cuentaEstado).toBe('error');
    expect(localStorage.getItem(storageKey)).toContain('"cantidad":4');
    (page as any).resetFacturaActual();
    guardar.and.callFake(async (_id, version, consumo) => (server = { ...server, ...calcularCuenta(consumo), version: version + 1 }));
    await page.recuperarConsumos();
    expect(server.items[0].cantidad).toBe(4);
    expect(page.cartItems[0].cantidad).toBe(4);
    expect(page.cuentaEstado).toBe('guardada');
  });

  it('bloquea modificaciones y cobro ante conflicto conservando los cambios locales', async () => {
    guardar.and.rejectWith(new Error('ACCOUNT_CONFLICT'));
    page.updateQuantity(page.cartItems[0], 2);
    await page.guardarCuentaActual();
    expect(page.cuentaEstado).toBe('conflicto');
    page.updateQuantity(page.cartItems[0], 3);
    page.removeCartItem(page.cartItems[0]);
    page.openCobroModal();
    expect(page.cartItems[0].cantidad).toBe(2);
    expect(page.cobroModalOpen).toBeFalse();
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });

  it('imprime la versión guardada con los últimos cambios sin cerrar la cuenta', async () => {
    page.updateQuantity(page.cartItems[0], 2);
    await page.imprimirPrecuenta();
    expect(print).toHaveBeenCalledOnceWith(server);
    expect(server.estado).toBe('abierta');
    expect(server.items[0].cantidad).toBe(2);
  });

  it('espera una elección explícita y conserva el carrito al cancelar la carga de otra cuenta', async () => {
    page.cuentaActiva = null;
    (page as any).alertCtrl = { create: async () => ({ present: async () => {}, onDidDismiss: async () => ({ role: 'cancel' }) }) };
    await page.abrirCuenta({ ...server, id: 'otra' });
    expect(page.cartItems.length).toBe(1);
    expect(page.cuentaActiva).toBeNull();
    expect((page as any).cuentasAbiertasService.crear).not.toHaveBeenCalled();
  });

  it('bloquea un segundo cobro mientras termina la validación asíncrona del turno', async () => {
    const emitir = jasmine.createSpy().and.resolveTo('factura-confirmada');
    Object.assign(page, {
      ensureTurnoActivo: async () => true, isOnline: () => true,
      showLoading: async () => {}, dismissLoading: async () => {},
      facturacionService: { validarStockItems: async () => {}, emitirFactura: emitir },
      fetchFacturaByIdWithRetry: async () => undefined, syncCitaAfterFactura: async () => {}, showSuccessToast: async () => {},
    });
    await Promise.all([page.emitirFactura(118), page.emitirFactura(118)]);
    expect(emitir).toHaveBeenCalledTimes(1);
    expect(page.cuentaActiva).toBeNull();
    expect(page.cartItems).toEqual([]);
    expect(page.isEmitting).toBeFalse();
  });
});
