import { ComprasService } from './compras.service';
import { Compra } from '../models/compra.model';
import { CompraItem } from '../models/compra-item.model';

describe('ComprasService.anularCompra', () => {
  function item(productoId: string, cantidad: number): CompraItem {
    return { productoId, nombre: productoId, cantidad, tipoItem: 'bien', manejaInventario: true, costoUnitario: 10 } as CompraItem;
  }

  function setup(items: CompraItem[], stock: Record<string, number>, extra: Partial<Compra> = {}) {
    const compra = { estado: 'confirmada', afectaInventario: true, items, ...extra };
    const documents: Record<string, any> = { 'compras/compra': compra };
    Object.entries(stock).forEach(([id, stockActual]) => {
      documents[`productosServicios/${id}`] = { stockActual };
    });
    let writing = false;
    let movementId = 0;
    const pending: (() => void)[] = [];
    const tx = {
      get: jasmine.createSpy('get').and.callFake(async (ref: string) => {
        if (writing) throw new Error('Firestore transactions require all reads to be executed before all writes.');
        return { exists: !!documents[ref], id: ref.split('/')[1], data: () => ({ ...documents[ref] }) };
      }),
      update: (ref: string, data: any) => {
        writing = true;
        pending.push(() => documents[ref] = { ...documents[ref], ...data });
      },
      set: (ref: string, data: any) => {
        writing = true;
        pending.push(() => documents[ref] = data);
      },
    };
    const db = {
      doc: (path: string) => path,
      collection: (path: string) => ({ doc: () => `${path}/${++movementId}` }),
      runTransaction: async (callback: (transaction: typeof tx) => Promise<void>) => {
        await callback(tx);
        pending.forEach(commit => commit());
      },
    };
    const service = new ComprasService({ firestore: db } as any, null!, null!, null!, null!);
    return { service, documents, tx };
  }

  it('revierte varios productos sin leer después de escribir', async () => {
    const { service, documents } = setup([item('a', 2), item('b', 3)], { a: 10, b: 8 });
    await service.anularCompra('compra');
    expect(documents['productosServicios/a'].stockActual).toBe(8);
    expect(documents['productosServicios/b'].stockActual).toBe(5);
    expect(documents['compras/compra'].estado).toBe('anulada');
    expect(documents['movimientosInventario/2'].stockNuevo).toBe(5);
  });

  it('acumula líneas repetidas del mismo producto', async () => {
    const { service, documents } = setup([item('a', 2), item('a', 3)], { a: 10 });
    await service.anularCompra('compra');
    expect(documents['productosServicios/a'].stockActual).toBe(5);
    expect(documents['movimientosInventario/2'].stockAnterior).toBe(8);
  });

  it('no confirma ningún cambio si la cantidad acumulada supera el stock', async () => {
    const { service, documents } = setup([item('a', 3), item('a', 3)], { a: 5 });
    await expectAsync(service.anularCompra('compra')).toBeRejectedWithError('INSUFFICIENT_STOCK_TO_REVERSE:a');
    expect(documents['productosServicios/a'].stockActual).toBe(5);
    expect(documents['compras/compra'].estado).toBe('confirmada');
    expect(documents['movimientosInventario/1']).toBeUndefined();
  });

  it('no descuenta stock si la compra no afectó inventario', async () => {
    const { service, documents, tx } = setup([item('a', 3)], {}, { afectaInventario: false });
    await service.anularCompra('compra');
    expect(tx.get).toHaveBeenCalledTimes(1);
    expect(documents['compras/compra'].estado).toBe('anulada');
    expect(documents['movimientosInventario/1']).toBeUndefined();
  });

  it('rechaza una segunda anulación sin descontar inventario', async () => {
    const { service, documents } = setup([item('a', 2)], { a: 8 }, { estado: 'anulada' });
    await expectAsync(service.anularCompra('compra')).toBeRejectedWithError('COMPRA_ALREADY_VOIDED');
    expect(documents['productosServicios/a'].stockActual).toBe(8);
  });
});
