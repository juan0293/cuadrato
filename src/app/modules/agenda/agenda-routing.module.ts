import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role.guard';
import { AgendaPage } from './pages/agenda.page';
import { CitaFormPage } from './pages/cita-form.page';
import { DisponibilidadPage } from './pages/disponibilidad.page';

const routes: Routes = [
  { path: '', component: AgendaPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'citas/nueva', component: CitaFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'citas/:id', component: CitaFormPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
  { path: 'disponibilidad', component: DisponibilidadPage, canActivate: [RoleGuard], data: { roles: ['admin', 'asistente'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class AgendaRoutingModule {}
