import { FormBuilder } from '@angular/forms';
import { FacturacionPage } from './facturacion.page';
import { ProductoServicio } from '../../inventario/models/producto-servicio.model';

describe('Facturación: lector de código de barras', () => {
  let page: FacturacionPage;
  let warnings: jasmine.Spy;
  let errors: jasmine.Spy;
  const producto = {
    id: 'producto-1', codigoInterno: '001234567890', nombre: 'Producto de prueba', activo: true,
    tipoItem: 'bien', manejaInventario: true, stockActual: 5, precioVenta: 100,
    categoriaNombre: 'General', tasaItbis: 0,
  } as ProductoServicio;

  beforeEach(() => {
    warnings = jasmine.createSpy().and.resolveTo();
    errors = jasmine.createSpy().and.resolveTo();
    page = Object.create(FacturacionPage.prototype);
    Object.assign(page, {
      productos: [{ ...producto }], cartItems: [], loading: false, isEmitting: false,
      filtrosCatalogo: new FormBuilder().nonNullable.group({ busqueda: [''], tipo: ['todos'], categoria: ['todas'] }),
      catalogStockFilter: 'todos', productosPage: 1, toastService: { warning: warnings, error: errors },
    });
  });

  function scan(code = producto.codigoInterno): KeyboardEvent {
    page.filtrosCatalogo.controls.busqueda.setValue(code);
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    page.onCatalogSearchKeydown(event);
    return event;
  }

  it('agrega el código exacto conservando ceros iniciales y limpia la búsqueda', () => {
    const event = scan();
    expect(page.cartItems.length).toBe(1);
    expect(page.cartItems[0].cantidad).toBe(1);
    expect(page.cartItems[0].codigo).toBe(producto.codigoInterno);
    expect(page.filtrosCatalogo.controls.busqueda.value).toBe('');
    expect(event.defaultPrevented).toBeTrue();
  });

  it('suma una unidad por cada escaneo consecutivo del mismo código', () => {
    scan(); scan(); scan();
    expect(page.cartItems.length).toBe(1);
    expect(page.cartItems[0].cantidad).toBe(3);
    expect(page.cartItems[0].total).toBe(300);
    expect(page.filtrosCatalogo.controls.busqueda.value).toBe('');
  });

  it('incrementa la línea existente aunque venga de un borrador con otra clave', () => {
    scan();
    page.cartItems[0].key = 'linea-de-borrador';
    scan();
    expect(page.cartItems.length).toBe(1);
    expect(page.cartItems[0].cantidad).toBe(2);
  });

  it('encuentra el producto aunque los filtros del catálogo lo oculten', () => {
    page.filtrosCatalogo.patchValue({ tipo: 'servicio', categoria: 'Otra' });
    scan();
    expect(page.cartItems.length).toBe(1);
  });

  it('avisa cuando no encuentra el código y deja la búsqueda lista para otro escaneo', () => {
    scan('9999999999999');
    expect(page.cartItems.length).toBe(0);
    expect(warnings).toHaveBeenCalledWith(jasmine.stringContaining('9999999999999'), 'Producto no encontrado');
    expect(page.filtrosCatalogo.controls.busqueda.value).toBe('');
    scan();
    expect(page.cartItems.length).toBe(1);
  });

  it('no permite agregar una cantidad mayor al stock', () => {
    page.productos[0].stockActual = 1;
    scan(); scan();
    expect(page.cartItems[0].cantidad).toBe(1);
    expect(errors).toHaveBeenCalledWith('Cantidad supera stock disponible.');
  });

  it('mantiene la búsqueda manual sin agregar por cada carácter', () => {
    page.filtrosCatalogo.controls.busqueda.setValue('Producto');
    page.onCatalogSearchKeydown(new KeyboardEvent('keydown', { key: 'o' }));
    expect(page.cartItems.length).toBe(0);
    expect(page.filtrosCatalogo.controls.busqueda.value).toBe('Producto');
    expect(warnings).not.toHaveBeenCalled();
  });

  it('evita seleccionar arbitrariamente un código duplicado', () => {
    page.productos.push({ ...producto, id: 'producto-2' });
    scan();
    expect(page.cartItems.length).toBe(0);
    expect(warnings).toHaveBeenCalledWith(jasmine.any(String), 'Código duplicado');
  });

  it('usa el valor del input cuando el formulario todavía no recibió el último carácter', () => {
    const input = document.createElement('input');
    input.value = producto.codigoInterno;
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    spyOn(event, 'composedPath').and.returnValue([input]);
    page.onCatalogSearchKeydown(event);
    expect(page.cartItems.length).toBe(1);
    expect(input.value).toBe('');
  });
});
