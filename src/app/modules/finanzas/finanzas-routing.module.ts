import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role.guard';
import { FinanzasPage } from './pages/finanzas.page';
import { MovimientoFinancieroFormPage } from './pages/movimiento-financiero-form.page';
import { MovimientosFinancierosPage } from './pages/movimientos-financieros.page';

const routes: Routes = [
  { path: '', component: FinanzasPage, canActivate: [RoleGuard], data: { roles: ['admin'] } },
  { path: 'movimientos', component: MovimientosFinancierosPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'movimientos/nuevo', component: MovimientoFinancieroFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class FinanzasRoutingModule {}
