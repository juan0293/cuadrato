import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminLayoutPage } from './admin-layout.page';

const routes: Routes = [{
  path: '', component: AdminLayoutPage, children: [
    { path: 'dashboard', loadChildren: () => import('../../modules/dashboard/dashboard.module').then((m) => m.DashboardModule) },
    { path: 'usuarios', loadChildren: () => import('../../modules/usuarios/usuarios.module').then((m) => m.UsuariosModule) },
    { path: 'agenda', loadChildren: () => import('../../modules/agenda/agenda.module').then((m) => m.AgendaModule) },
    { path: 'inventario', loadChildren: () => import('../../modules/inventario/inventario.module').then((m) => m.InventarioModule) },
    { path: 'cuentas-por-pagar', redirectTo: 'inventario/cuentas-por-pagar', pathMatch: 'full' },
    { path: 'cuentas-por-cobrar', redirectTo: 'facturacion/cuentas-por-cobrar', pathMatch: 'full' },
    { path: 'finanzas', loadChildren: () => import('../../modules/finanzas/finanzas.module').then((m) => m.FinanzasModule) },
    { path: 'facturacion', loadChildren: () => import('../../modules/facturacion/facturacion.module').then((m) => m.FacturacionModule) },
    { path: 'perfil', loadChildren: () => import('../../modules/perfil/perfil.module').then((m) => m.PerfilModule) },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  ]
}];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class AdminLayoutRoutingModule {}
