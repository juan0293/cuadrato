import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PerfilPage } from './pages/perfil.page';

const routes: Routes = [{ path: '', component: PerfilPage }];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class PerfilRoutingModule {}
