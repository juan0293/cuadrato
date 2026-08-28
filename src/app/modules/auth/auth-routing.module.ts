import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthPage } from './pages/auth.page';
import { PerfilPage } from './pages/perfil.page';
import { AuthGuard } from '../../core/guards/auth.guard';
import { LoginGuard } from '../../core/guards/login.guard';

const routes: Routes = [
  { path: 'login', canActivate: [LoginGuard], component: AuthPage },
  { path: 'perfil', canActivate: [AuthGuard], component: PerfilPage },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class AuthRoutingModule {}
