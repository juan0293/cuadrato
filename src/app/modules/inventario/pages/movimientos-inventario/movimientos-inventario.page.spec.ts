import { of } from 'rxjs';
import { MovimientosInventarioPage } from './movimientos-inventario.page';
import { MovimientoInventario } from '../../models/movimiento-inventario.model';

describe('Movimientos de inventario: filtro y valoración de venta', () => {
  let page: MovimientosInventarioPage;
  let productos: jasmine.Spy;
  const movimiento = (extra: Partial<MovimientoInventario> = {}): MovimientoInventario => ({
    productoId: 'producto', tipoMovimiento: 'entrada_compra', cantidad: 3,
    costoUnitario: 10, creadoPor: 'usuario', fecha: new Date().toISOString(), ...extra,
  });

  beforeEach(() => {
    productos = jasmine.createSpy().and.returnValue(of([
      { id: 'producto', precioVenta: 25.5 }, { id: 'gratis', precioVenta: 0 },
    ]));
    page = new MovimientosInventarioPage(
      { list: () => of([movimiento(), movimiento({ tipoMovimiento: 'anulacion_compra' }), movimiento({ tipoMovimiento: 'salida_venta' })]) } as any,
      {} as any, { list: () => of([]) } as any, {} as any, {} as any,
      { theme: 'light' } as any, { list: productos } as any,
    );
    page.ngOnInit();
  });
  afterEach(() => page.ngOnDestroy());

  it('filtra anulaciones específicamente y conserva el grupo de salidas', () => {
    page.onTipoChange('anulacion_compra');
    expect(page.movimientosFiltrados.map(m => m.tipoMovimiento)).toEqual(['anulacion_compra']);
    page.onTipoChange('salida');
    expect(page.movimientosFiltrados.length).toBe(2);
    expect(productos).toHaveBeenCalledTimes(1);
  });

  it('valora cantidad por precio actual sin modificar los costos', () => {
    expect(page.getPrecioVenta(movimiento())).toBe(25.5);
    expect(page.getValorTotalVenta(movimiento())).toBe(76.5);
    expect(page.getValorTotal(movimiento())).toBe(30);
    expect(page.getValorTotalVenta(movimiento({ cantidad: 1.25 }))).toBe(31.88);
    expect(page.getValorTotalVenta(movimiento({ productoId: 'gratis' }))).toBe(0);
  });

  it('distingue precio cero de producto sin precio disponible', () => {
    expect(page.getValorTotalVenta(movimiento({ productoId: 'eliminado' }))).toBeNull();
    expect(page.getPrecioVenta(movimiento({ productoId: undefined, insumoId: 'producto' }))).toBeNull();
    expect(page.formatVenta(null)).toBe('No disponible');
  });
});
