import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { CuentasAbiertasService } from './cuentas-abiertas.service';
import { FacturacionService } from './facturacion.service';
import { CuentaAbierta } from '../models/cuenta-abierta.model';
import { calcularCuenta, precuentaDocumento } from '../helpers/cuenta-abierta.helper';

// Integración opcional contra un proyecto demo aislado. Nunca usa Firebase real.
// Iniciar Firestore Emulator en 127.0.0.1:8089 con firestore.rules del proyecto.
describe('Cuentas abiertas: integración transaccional en Firestore Emulator', () => {
  let app: firebase.app.App;
  let db: firebase.firestore.Firestore;
  let cuentas: CuentasAbiertasService;
  let facturacion: FacturacionService;
  const projectId = 'demo-cuadrato-cuentas';
  const uid = `operador-${Date.now()}`;
  const root = `http://127.0.0.1:8089/v1/projects/${projectId}/databases/(default)/documents`;
  const productoId = `producto-${uid}`;

  beforeAll(async () => {
    try { await fetch('http://127.0.0.1:8089/', { signal: AbortSignal.timeout(1500) }); }
    catch { pending('Requiere Firestore Emulator local en puerto 8089.'); return; }
    const seeded = await fetch(`${root}/usuarios/${uid}`, { method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { rol: { stringValue: 'admin' } } }),
    });
    if (!seeded.ok) throw new Error('No se pudo preparar el usuario del emulador.');
    app = firebase.initializeApp({ projectId, apiKey: 'demo-only' }, uid);
    db = app.firestore();
    db.useEmulator('127.0.0.1', 8089, { mockUserToken: { sub: uid } });
    cuentas = new CuentasAbiertasService({ firestore: db } as any);
    facturacion = new FacturacionService({} as any, { firestore: db } as any, {} as any, {} as any);
  });
  afterAll(async () => { if (app) await app.delete(); });

  async function crear(stock = 10): Promise<CuentaAbierta> {
    await db.doc(`productosServicios/${productoId}`).set({ nombre: 'Bebida', manejaInventario: true, stockActual: stock });
    return cuentas.crear({ clienteNombre: 'Cliente sin registro', clienteId: '', descuentoGlobal: 10,
      items: [{ productoServicioId: productoId, descripcion: 'Bebida', tipo: 'producto', cantidad: 2,
        precioUnitario: 100, costoUnitario: 40, aplicaItbis: true, porcentajeItbis: 18, manejaInventario: true, total: 0 }],
    }, uid);
  }

  function payload(cuenta: CuentaAbierta, credito = false) {
    const { tipoDocumento, ...documento } = precuentaDocumento(cuenta);
    return { ...documento, cuentaAbiertaVersion: cuenta.version, creadaPor: uid,
      pagos: { efectivo: credito ? 0 : cuenta.total, tarjeta: 0, transferencia: 0,
        credito: credito ? cuenta.total : 0, totalCredito: credito ? cuenta.total : 0,
        totalPagadoAhora: credito ? 0 : cuenta.total }, formaPago: credito ? 'credito' as const : 'efectivo' as const,
    };
  }

  it('crea, recupera y edita consumos sin factura, ingreso ni descuento de existencias', async () => {
    const cuenta = await crear();
    const updated = await cuentas.guardar(cuenta.id, 1, { ...cuenta, items: [{ ...cuenta.items[0], cantidad: 3 }] }, uid);
    expect((await cuentas.get(cuenta.id)).total).toBe(344);
    expect(updated.version).toBe(2);
    expect((await db.doc(`productosServicios/${productoId}`).get()).data()!['stockActual']).toBe(10);
    expect((await db.collection('facturas').where('cuentaAbiertaId', '==', cuenta.id).get()).empty).toBeTrue();
    expect((await db.collection(`cuentasAbiertas/${cuenta.id}/eventos`).get()).size).toBe(2);
    expect(precuentaDocumento(updated).tipoDocumento).toBe('precuenta');
  }, 20000);

  it('rechaza una de dos ediciones concurrentes sin sobrescribir consumos', async () => {
    const cuenta = await crear();
    const results = await Promise.allSettled([
      cuentas.guardar(cuenta.id, 1, { ...cuenta, clienteNombre: 'Operador A' }, uid),
      cuentas.guardar(cuenta.id, 1, { ...cuenta, clienteNombre: 'Operador B' }, uid),
    ]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter(r => r.status === 'rejected').length).toBe(1);
    expect((await cuentas.get(cuenta.id)).version).toBe(2);
  }, 20000);

  it('solo cobra una vez ante emisiones simultáneas y descuenta stock una sola vez', async () => {
    const cuenta = await crear();
    const results = await Promise.allSettled([facturacion.emitirFactura(payload(cuenta)), facturacion.emitirFactura(payload(cuenta))]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
    const cerrada = await cuentas.get(cuenta.id);
    expect(cerrada.estado).toBe('cerrada');
    expect((await db.collection('facturas').where('cuentaAbiertaId', '==', cuenta.id).get()).size).toBe(1);
    expect((await db.doc(`productosServicios/${productoId}`).get()).data()!['stockActual']).toBe(8);
    expect((await db.collection('movimientosInventario').where('referenciaId', '==', cerrada.facturaId).get()).size).toBe(1);
    expect((await db.collection('movimientosFinancieros').where('facturaId', '==', cerrada.facturaId).get()).size).toBe(1);
    await expectAsync(facturacion.emitirFactura(payload(cuenta))).toBeRejectedWithError('ACCOUNT_NOT_OPEN');
  }, 20000);

  it('revierte toda la operación si falta stock y conserva la cuenta abierta', async () => {
    const cuenta = await crear(1);
    await expectAsync(facturacion.emitirFactura(payload(cuenta))).toBeRejectedWithError('INSUFFICIENT_STOCK:Bebida');
    expect((await cuentas.get(cuenta.id)).estado).toBe('abierta');
    expect((await db.doc(`productosServicios/${productoId}`).get()).data()!['stockActual']).toBe(1);
    expect((await db.collection('facturas').where('cuentaAbiertaId', '==', cuenta.id).get()).empty).toBeTrue();
  }, 20000);

  it('registra venta a crédito y deuda sin inventar dinero cobrado', async () => {
    const cuenta = await crear();
    const facturaId = await facturacion.emitirFactura(payload(cuenta, true));
    expect((await db.doc(`cuentasPorCobrar/${facturaId}`).get()).data()!['balancePendiente']).toBe(cuenta.total);
    expect((await db.collection('movimientosFinancieros').where('facturaId', '==', facturaId).get()).empty).toBeTrue();
    expect((await cuentas.get(cuenta.id)).estado).toBe('cerrada');
  }, 20000);

  it('exige guardar los últimos cambios antes de emitir y no convierte precuentas en facturas', async () => {
    const cuenta = await crear();
    const modified = calcularCuenta({ ...cuenta, items: [{ ...cuenta.items[0], cantidad: 1 }] });
    await expectAsync(facturacion.emitirFactura({ ...payload(cuenta), ...modified })).toBeRejectedWithError('ACCOUNT_CONFLICT');
    await expectAsync(facturacion.emitirFactura(precuentaDocumento(cuenta))).toBeRejectedWithError('PREBILL_NOT_INVOICE');
    expect((await cuentas.get(cuenta.id)).estado).toBe('abierta');
  }, 20000);

  it('cancela con motivo, conserva el documento y evita editarlo o cobrarlo', async () => {
    const cuenta = await crear();
    await cuentas.cancelar(cuenta, 'Cliente se retira', uid);
    const cancelada = await cuentas.get(cuenta.id);
    expect(cancelada.estado).toBe('cancelada');
    expect(cancelada.motivoCancelacion).toBe('Cliente se retira');
    await expectAsync(cuentas.guardar(cuenta.id, cancelada.version, cancelada, uid)).toBeRejectedWithError('ACCOUNT_NOT_OPEN');
    await expectAsync(facturacion.emitirFactura(payload(cancelada))).toBeRejectedWithError('ACCOUNT_NOT_OPEN');
    await expectAsync(db.doc(`cuentasAbiertas/${cuenta.id}`).delete()).toBeRejected();
  }, 20000);

  it('las reglas impiden cerrar sin factura o crear otra factura contra una cuenta cerrada', async () => {
    const cuenta = await crear();
    await expectAsync(db.doc(`cuentasAbiertas/${cuenta.id}`).update({ estado: 'cerrada', version: 2,
      actualizadaPor: uid, facturaId: 'inexistente' })).toBeRejected();
    await facturacion.emitirFactura(payload(cuenta));
    const duplicada = JSON.parse(JSON.stringify({ ...payload(cuenta), estado: 'emitida', numero: 'duplicada' }));
    await expectAsync(db.collection('facturas').add(duplicada)).toBeRejectedWith(jasmine.objectContaining({ code: 'permission-denied' }));
  }, 20000);

  it('mantiene las cuentas restringidas a los perfiles del punto de venta', async () => {
    const cuenta = await crear();
    const artistUid = `${uid}-artista`;
    await fetch(`${root}/usuarios/${artistUid}`, { method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { rol: { stringValue: 'artista' } } }),
    });
    const artistApp = firebase.initializeApp({ projectId, apiKey: 'demo-only' }, artistUid);
    try {
      const artistDb = artistApp.firestore();
      artistDb.useEmulator('127.0.0.1', 8089, { mockUserToken: { sub: artistUid } });
      await expectAsync(artistDb.doc(`cuentasAbiertas/${cuenta.id}`).get({ source: 'server' }))
        .toBeRejectedWith(jasmine.objectContaining({ code: 'permission-denied' }));
    } finally { await artistApp.delete(); }
  }, 20000);
});
