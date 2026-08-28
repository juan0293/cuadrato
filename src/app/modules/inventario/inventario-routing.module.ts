import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role.guard';
import { InventarioPage } from './pages/inventario.page';
import { InsumoFormPage } from './pages/insumo-form.page';
import { MovimientoFormPage } from './pages/movimiento-form.page';
import { MovimientosPage } from './pages/movimientos.page';
import { ProductoServicioFormPage } from './pages/producto-servicio-form/producto-servicio-form.page';
import { ProductosServiciosPage } from './pages/productos-servicios/productos-servicios.page';
import { MovimientoInventarioFormPage } from './pages/movimiento-inventario-form/movimiento-inventario-form.page';
import { MovimientosInventarioPage } from './pages/movimientos-inventario/movimientos-inventario.page';
import { ComprasPage } from './pages/compras/compras.page';
import { CompraFormPage } from './pages/compra-form/compra-form.page';
import { CompraDetallePage } from './pages/compra-detalle/compra-detalle.page';
import { CuentasPorPagarPage } from './pages/cuentas-por-pagar/cuentas-por-pagar.page';
import { CuentaPorPagarDetallePage } from './pages/cuenta-por-pagar-detalle/cuenta-por-pagar-detalle.page';
import { DecomisosPage } from './pages/decomisos/decomisos.page';
import { DecomisoFormPage } from './pages/decomiso-form/decomiso-form.page';
import { EcfPreviewPage } from './pages/ecf-preview/ecf-preview.page';
import { CategoriasProductosPage } from './pages/categorias-productos/categorias-productos.page';
import { UnidadesMedidaPage } from './pages/unidades-medida/unidades-medida.page';
import { UtilidadesPage } from './pages/utilidades/utilidades.page';
import { ProveedoresPage } from './pages/proveedores/proveedores.page';

const routes: Routes = [
  { path: '', component: InventarioPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'nuevo', component: InsumoFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'movimientos', component: MovimientosPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'movimientos/nuevo', component: MovimientoFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente', 'artista'] } },
  { path: 'productos-servicios', component: ProductosServiciosPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'productos-servicios/nuevo', component: ProductoServicioFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'productos-servicios/:id', component: ProductoServicioFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'movimientos-inventario', component: MovimientosInventarioPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente', 'artist', 'artista'] } },
  { path: 'movimientos-inventario/nuevo', component: MovimientoInventarioFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente', 'artist', 'artista'] } },
  { path: 'compras', component: ComprasPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'compras/nuevo', component: CompraFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'compras/:id', component: CompraDetallePage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'cuentas-por-pagar', component: CuentasPorPagarPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'cuentas-por-pagar/:id', component: CuentaPorPagarDetallePage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'decomisos', component: DecomisosPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'decomisos/nuevo', component: DecomisoFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'ecf-preview/:compraId', component: EcfPreviewPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'categorias-productos', component: CategoriasProductosPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'unidades-medida', component: UnidadesMedidaPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'utilidades', component: UtilidadesPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: 'proveedores', component: ProveedoresPage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin', 'assistant', 'asistente'] } },
  { path: ':id', component: InsumoFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class InventarioRoutingModule {}
