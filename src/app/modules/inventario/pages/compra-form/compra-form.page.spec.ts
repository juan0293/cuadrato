import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { CompraFormPage } from './compra-form.page';
import { ProductoServicio } from '../../models/producto-servicio.model';
import { Compra } from '../../models/compra.model';

describe('CompraFormPage: precio de venta', () => {
  let page: CompraFormPage;
  const producto = {
    id: 'producto', nombre: 'Producto', precioCompra: 100, precioVenta: 175,
    utilidadPorcentaje: 20, tasaItbis: 0, tipoItem: 'bien', manejaInventario: true,
  } as ProductoServicio;

  beforeEach(() => {
    page = new CompraFormPage(
      new FormBuilder(), { list: () => of([]) } as any,
      { getProveedoresActivos: () => of([]) } as any,
      { getUtilidadesActivas: () => of([]) } as any,
      null!, null!, null!,
      { success: async () => {}, error: async () => {} } as any,
      null!, null!, null!,
    );
  });

  it('carga y agrega el precio actual sin aplicar la sugerencia', async () => {
    await page.onProductoSelected(producto);
    expect(page.form.controls.precioVenta.value).toBe(175);
    expect(page.precioVentaSugeridoLinea).toBe(120);
    await page.addItem();
    expect(page.items[0].precioVenta).toBe(175);
  });

  it('conserva el precio manual al recalcular y guardar la línea', async () => {
    await page.onProductoSelected(producto);
    page.form.controls.precioVenta.setValue(190);
    page.form.controls.precioCompra.setValue(110);
    await page.addItem();
    page.onItemPrecioCompraChange(0, 130);
    expect(page.items[0].precioVenta).toBe(190);
    page.editCompraItem(0);
    page.editingItem!.precioVenta = 195;
    page.editingItem!.costoUnitario = 140;
    page.saveEditedCompraItem();
    expect(page.items[0].precioVenta).toBe(195);
  });

  it('aplica la sugerencia únicamente mediante la acción explícita', async () => {
    await page.onProductoSelected(producto);
    page.aplicarPrecioSugerido();
    expect(page.form.controls.precioVenta.value).toBe(120);
    await page.addItem();
    page.editCompraItem(0);
    page.editingItem!.costoUnitario = 200;
    page.recalculateEditingItem();
    expect(page.editingItem!.precioVenta).toBe(120);
    page.aplicarPrecioSugeridoEdicion();
    expect(page.editingItem!.precioVenta).toBe(240);
  });

  it('abre el selector nuevamente después de agregar una línea válida', async () => {
    const selector = { open: jasmine.createSpy('open') };
    (page as any).productoSelector = selector;
    await page.onProductoSelected(producto);
    await page.addItem();
    expect(selector.open).toHaveBeenCalledTimes(1);
    expect(page.items.length).toBe(1);
    expect(page.selectedProducto).toBeNull();
    expect(page.form.controls.productoId.value).toBe('');
  });

  it('no abre el selector al intentar agregar una línea inválida', async () => {
    const selector = { open: jasmine.createSpy('open') };
    (page as any).productoSelector = selector;
    await page.addItem();
    expect(selector.open).not.toHaveBeenCalled();
  });
});

describe('CompraFormPage: confirmación y protección de envíos', () => {
  let page: CompraFormPage;
  let compras: { createCompraBorrador: jasmine.Spy; confirmarCompra: jasmine.Spy };
  let alert: { present: jasmine.Spy; onDidDismiss: jasmine.Spy };
  let alertCtrl: { create: jasmine.Spy };
  let router: { navigate: jasmine.Spy };
  let toast: { success: jasmine.Spy; error: jasmine.Spy };
  const payload = { proveedorId: 'proveedor', proveedorNombre: 'Proveedor de prueba', numeroFactura: 'F-001',
    total: 100, items: [], afectaInventario: true, condicionPago: 'contado' } as unknown as Compra;

  beforeEach(() => {
    compras = { createCompraBorrador: jasmine.createSpy().and.resolveTo('compra-1'),
      confirmarCompra: jasmine.createSpy().and.resolveTo({ ...payload, id: 'compra-1', estado: 'confirmada' }) };
    alert = { present: jasmine.createSpy().and.resolveTo(), onDidDismiss: jasmine.createSpy().and.resolveTo({ role: 'confirm' }) };
    alertCtrl = { create: jasmine.createSpy().and.resolveTo(alert) };
    router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    toast = { success: jasmine.createSpy().and.resolveTo(), error: jasmine.createSpy().and.resolveTo() };
    page = new CompraFormPage(new FormBuilder(), { list: () => of([]) } as any,
      { getProveedoresActivos: () => of([]) } as any, { getUtilidadesActivas: () => of([]) } as any,
      compras as any, null!, { user$: of({ uid: 'usuario' }) } as any, toast as any,
      { create: async () => ({ present: async () => {} }) } as any, router as any, alertCtrl as any);
    spyOn(page, 'buildCompraPayload').and.returnValue({ ...payload });
    spyOn(page, 'validateCompraBeforeSave').and.returnValue([]);
  });

  it('cancelar la alerta no crea una compra y libera el botón', async () => {
    alert.onDidDismiss.and.resolveTo({ role: 'cancel' });
    await page.confirmarCompra();
    expect(compras.createCompraBorrador).not.toHaveBeenCalled();
    expect(page.isSubmitting).toBeFalse();
    expect(page.processingCompra).toBeFalse();
  });

  it('bloquea clics repetidos desde el primer await y mientras se guarda', async () => {
    compras.createCompraBorrador.and.callFake(async () => {
      expect(page.processingCompra).toBeTrue();
      await page.confirmarCompra();
      return 'compra-1';
    });
    const first = page.confirmarCompra();
    expect(page.isSubmitting).toBeTrue();
    await page.confirmarCompra();
    await first;
    expect(alertCtrl.create).toHaveBeenCalledTimes(1);
    expect(compras.createCompraBorrador).toHaveBeenCalledTimes(1);
    expect(compras.confirmarCompra).toHaveBeenCalledOnceWith('compra-1');
    expect(page.processingCompra).toBeFalse();
    await page.confirmarCompra();
    expect(compras.createCompraBorrador).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/inventario/compras', 'compra-1']);
  });

  it('un error posterior al registro dirige al documento existente sin crear otro', async () => {
    compras.confirmarCompra.and.rejectWith(new Error('CONNECTION_FAILED'));
    spyOn(console, 'error');
    await page.confirmarCompra();
    expect(page.processingCompra).toBeFalse();
    expect(page.isSubmitting).toBeFalse();
    expect(page.hasRegisteredCompra).toBeTrue();
    await page.confirmarCompra();
    expect(compras.createCompraBorrador).toHaveBeenCalledTimes(1);
    expect(compras.confirmarCompra).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/inventario/compras', 'compra-1']);
  });

  it('si la creación falla libera el bloqueo y permite volver a intentarlo', async () => {
    compras.createCompraBorrador.and.rejectWith(new Error('OFFLINE'));
    spyOn(console, 'error');
    await page.confirmarCompra();
    expect(page.hasRegisteredCompra).toBeFalse();
    expect(page.isSubmitting).toBeFalse();
    expect(page.processingCompra).toBeFalse();
    compras.createCompraBorrador.and.resolveTo('compra-1');
    await page.confirmarCompra();
    expect(compras.confirmarCompra).toHaveBeenCalledTimes(1);
  });

  it('no muestra confirmación ni escribe si faltan datos requeridos', async () => {
    (page.validateCompraBeforeSave as jasmine.Spy).and.returnValue(['Selecciona un proveedor.']);
    await page.confirmarCompra();
    expect(alertCtrl.create).not.toHaveBeenCalled();
    expect(compras.createCompraBorrador).not.toHaveBeenCalled();
    expect(page.isSubmitting).toBeFalse();
  });
});
