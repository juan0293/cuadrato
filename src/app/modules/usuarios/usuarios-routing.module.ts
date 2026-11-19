import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsuariosPage } from './pages/usuarios.page';
import { RoleGuard } from '../../core/guards/role.guard';
import { UsuarioFormPage } from './pages/usuario-form.page';

const routes: Routes = [
  { path: 'nuevo', component: UsuarioFormPage, canActivate: [RoleGuard], data: { roles: ['superadmin', 'admin'] } },
  { path: 'editar/:id', component: UsuarioFormPage, canActivate: [RoleGuard], data: { roles: ['superadmin', 'admin'] } },
  { path: '', component: UsuariosPage, canActivate: [RoleGuard], data: { roles: ['superadmin', 'admin', 'assistant', 'artist', 'asistente', 'artista'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class UsuariosRoutingModule {}
