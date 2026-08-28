import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsuariosPage } from './pages/usuarios.page';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  { path: '', component: UsuariosPage, canActivate: [RoleGuard], data: { roles: ['superadmin', 'admin', 'assistant', 'artist', 'asistente', 'artista'] } },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class UsuariosRoutingModule {}
