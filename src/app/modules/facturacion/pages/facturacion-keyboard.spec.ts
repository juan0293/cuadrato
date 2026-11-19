import { FormBuilder } from '@angular/forms';
import { FacturacionPage } from './facturacion.page';

describe('Facturación: edición de cantidad y atajos de cobro', () => {
  let page: FacturacionPage;
  let host: HTMLDivElement;
  let errors: jasmine.Spy;

  beforeEach(() => {
    const fb = new FormBuilder().nonNullable;
    page = Object.create(FacturacionPage.prototype);
    errors = jasmine.createSpy().and.resolveTo();
    Object.assign(page, {
      document, viewEntered: true, loading: false, turnoLoading: false, turnoActionLoading: false,
      isEmitting: false, cobroSubmitting: false, cobroKeyboardReady: false, cobroModalOpen: false,
      turnoActivo: { id: 'turno', estado: 'abierto' }, cuentaActiva: null, cuentaActionBusy: false,
      cartItems: [{ key: 'p1', descripcion: 'Producto', cantidad: 1, precioUnitario: 100, subtotal: 100,
        itbis: 18, aplicaItbis: true, porcentajeItbis: 18, total: 118, manejaInventario: true, stockActual: 20 }],
      facturaForm: fb.group({ formaPago: ['efectivo'], descuentoGlobal: [0] }),
      filtrosCatalogo: fb.group({ busqueda: [''] }),
      cobroForm: fb.group({ montoPagado: [0], efectivo: [0], tarjeta: [0], transferencia: [0], credito: [0] }),
      toastService: { error: errors },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  function press(target: HTMLElement, key: string, modal = false, extra: KeyboardEventInit = {}) {
    host.onkeydown = event => modal ? page.onCobroKeydown(event) : page.onVentaKeydown(event);
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true, ...extra });
    target.dispatchEvent(event);
    return event;
  }

  it('permite borrar y escribir una nueva cantidad sin cambiar el precio ni perder la línea', () => {
    const input = document.createElement('input'); input.type = 'number'; host.append(input);
    input.addEventListener('input', event => page.onCartQuantityInput(page.cartItems[0], event));
    input.value = ''; input.dispatchEvent(new Event('input'));
    expect(page.cartItems[0].cantidad).toBe(1);
    input.value = '12'; input.dispatchEvent(new Event('input'));
    expect(page.cartItems[0].cantidad).toBe(12);
    expect(page.cartItems[0].total).toBe(1416);
    expect(page.cartItems[0].precioUnitario).toBe(100);
  });

  it('conserva la cantidad válida al superar stock o introducir cero y la restaura al salir', () => {
    const input = document.createElement('input'); input.type = 'number'; host.append(input);
    input.addEventListener('input', event => page.onCartQuantityInput(page.cartItems[0], event));
    input.addEventListener('blur', event => page.onCartQuantityBlur(page.cartItems[0], event));
    input.value = '21'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
    expect(page.cartItems[0].cantidad).toBe(1); expect(input.value).toBe('1');
    expect(errors).toHaveBeenCalled();
    input.value = '0'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('1');
    page.updateQuantity(page.cartItems[0], Infinity);
    expect(page.cartItems[0].cantidad).toBe(1);
  });

  it('abre el cobro con Espacio cuando hay productos y evita desplazar la página', () => {
    const event = press(host, ' ');
    expect(event.defaultPrevented).toBeTrue();
    expect(page.cobroModalOpen).toBeTrue();
    expect(page.cobroForm.controls.montoPagado.value).toBe(118);
  });

  it('permite Espacio con el buscador vacío y conserva espacios al buscar nombres', () => {
    const wrapper = document.createElement('span'); wrapper.setAttribute('data-pos-catalog-search', '');
    const input = document.createElement('input'); wrapper.append(input); host.append(wrapper);
    input.value = 'Producto';
    expect(press(input, ' ').defaultPrevented).toBeFalse();
    expect(page.cobroModalOpen).toBeFalse();
    input.value = '';
    expect(press(input, ' ').defaultPrevented).toBeTrue();
    expect(page.cobroModalOpen).toBeTrue();
  });

  it('no intercepta Espacio en cantidades, botones ni otros diálogos', () => {
    for (const tag of ['input', 'button', 'textarea']) {
      const element = document.createElement(tag); host.append(element);
      expect(press(element, ' ').defaultPrevented).toBeFalse();
    }
    page.cuentasModalOpen = true; press(host, ' ');
    expect(page.cobroModalOpen).toBeFalse();
    page.cuentasModalOpen = false;
    const alert = document.createElement('ion-alert'); host.append(alert);
    press(host, ' ');
    expect(page.cobroModalOpen).toBeFalse();
  });

  it('ignora Espacio sin productos, con página oculta o durante una operación', () => {
    const open = spyOn(page, 'openCobroModal');
    press(host, ' ', false, { repeat: true });
    press(host, ' ', false, { ctrlKey: true });
    (page as any).viewEntered = false; press(host, ' ');
    (page as any).viewEntered = true; page.isEmitting = true; press(host, ' ');
    page.isEmitting = false; page.cartItems = []; press(host, ' ');
    expect(open).not.toHaveBeenCalled();
  });

  it('Enter en el monto del modal confirma una vez y cancela el submit implícito', () => {
    page.openCobroModal(); page.cobroKeyboardReady = true;
    const confirm = spyOn(page, 'confirmarCobroYEmitir').and.resolveTo();
    const input = document.createElement('input'); host.append(input);
    expect(press(input, 'Enter', true).defaultPrevented).toBeTrue();
    press(input, 'Enter', true, { repeat: true });
    expect(confirm).toHaveBeenCalledOnceWith(false);
  });

  it('ignora Enter antes de presentar el modal, con alertas activas o durante la emisión', () => {
    page.openCobroModal();
    const confirm = spyOn(page, 'confirmarCobroYEmitir').and.resolveTo();
    press(host, 'Enter', true);
    page.cobroKeyboardReady = true;
    const alert = document.createElement('ion-alert'); host.append(alert);
    press(host, 'Enter', true); alert.remove();
    page.isEmitting = true; press(host, 'Enter', true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('conserva la activación normal de los botones del modal con Enter', () => {
    page.openCobroModal(); page.cobroKeyboardReady = true;
    const confirm = spyOn(page, 'confirmarCobroYEmitir').and.resolveTo();
    const button = document.createElement('button'); host.append(button);
    expect(press(button, 'Enter', true).defaultPrevented).toBeFalse();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('bloquea confirmaciones simultáneas incluso antes de que comience la emisión', async () => {
    page.openCobroModal();
    let complete!: () => void;
    const pending = new Promise<void>(resolve => complete = resolve);
    const emit = spyOn(page, 'emitirFactura').and.returnValue(pending);
    const first = page.confirmarCobroYEmitir();
    await page.confirmarCobroYEmitir();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(page.cobroSubmitting).toBeTrue();
    complete(); await first;
    expect(page.cobroSubmitting).toBeFalse();
  });
});
