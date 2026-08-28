import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role.guard';
import { FacturacionPage } from './pages/facturacion.page';
import { FacturaFormPage } from './pages/factura-form.page';
import { CuentasPorCobrarPage } from './pages/cuentas-por-cobrar/cuentas-por-cobrar.page';
import { CompanyProfilePage } from './pages/company-profile/company-profile.page';

const routes: Routes = [
  { path: '', component: FacturacionPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'nueva', component: FacturaFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'cuentas-por-cobrar', component: CuentasPorCobrarPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'empresa', component: CompanyProfilePage, canActivate: [RoleGuard], data: { roles: ['admin', 'superadmin'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class FacturacionRoutingModule {}
