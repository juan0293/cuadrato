import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { InventarioPage } from './pages/inventario.page';
import { InventarioRoutingModule } from './inventario-routing.module';
import { InsumoCardComponent } from './components/insumo-card/insumo-card.component';
import { StockAlertChipComponent } from './components/stock-alert-chip/stock-alert-chip.component';
import { MovimientoInventarioCardComponent } from './components/movimiento-inventario-card/movimiento-inventario-card.component';
import { InsumoFormPage } from './pages/insumo-form.page';
import { MovimientoFormPage } from './pages/movimiento-form.page';
import { MovimientosPage } from './pages/movimientos.page';
import { ProductosServiciosPage } from './pages/productos-servicios/productos-servicios.page';
import { ProductoServicioFormPage } from './pages/producto-servicio-form/producto-servicio-form.page';
import { ProductoServicioTableComponent } from './components/producto-servicio-table/producto-servicio-table.component';
import { TaxIndicatorChipComponent } from './components/tax-indicator-chip/tax-indicator-chip.component';
import { StockStatusChipComponent } from './components/stock-status-chip/stock-status-chip.component';
import { MovimientosInventarioPage } from './pages/movimientos-inventario/movimientos-inventario.page';
import { MovimientoInventarioFormPage } from './pages/movimiento-inventario-form/movimiento-inventario-form.page';
import { ComprasPage } from './pages/compras/compras.page';
import { CompraFormPage } from './pages/compra-form/compra-form.page';
import { CompraDetallePage } from './pages/compra-detalle/compra-detalle.page';
import { CompraItemRowComponent } from './components/compra-item-row/compra-item-row.component';
import { CuentasPorPagarPage } from './pages/cuentas-por-pagar/cuentas-por-pagar.page';
import { CuentaPorPagarDetallePage } from './pages/cuenta-por-pagar-detalle/cuenta-por-pagar-detalle.page';
import { DecomisosPage } from './pages/decomisos/decomisos.page';
import { DecomisoFormPage } from './pages/decomiso-form/decomiso-form.page';
import { EcfPreviewPage } from './pages/ecf-preview/ecf-preview.page';
import { CategoriasProductosPage } from './pages/categorias-productos/categorias-productos.page';
import { UnidadesMedidaPage } from './pages/unidades-medida/unidades-medida.page';
import { UtilidadesPage } from './pages/utilidades/utilidades.page';
import { ProveedoresPage } from './pages/proveedores/proveedores.page';

@NgModule({
  declarations: [
    InventarioPage,
    InsumoCardComponent,
    StockAlertChipComponent,
    MovimientoInventarioCardComponent,
    InsumoFormPage,
    MovimientoFormPage,
    MovimientosPage,
    ProductosServiciosPage,
    ProductoServicioFormPage,
    ProductoServicioTableComponent,
    TaxIndicatorChipComponent,
    StockStatusChipComponent,
    MovimientosInventarioPage,
    MovimientoInventarioFormPage,
    ComprasPage,
    CompraFormPage,
    CompraDetallePage,
    CompraItemRowComponent,
    CuentasPorPagarPage,
    CuentaPorPagarDetallePage,
    DecomisosPage,
    DecomisoFormPage,
    EcfPreviewPage,
    CategoriasProductosPage,
    UnidadesMedidaPage,
    UtilidadesPage,
    ProveedoresPage,
  ],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, SharedModule, InventarioRoutingModule],
})
export class InventarioModule {}
