import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MobileLayoutPage } from './mobile-layout.page';

const routes: Routes = [{ path: '', component: MobileLayoutPage, children: [
  { path: '', loadChildren: () => import('../../modules/mobile-artista/mobile-artista.module').then((m) => m.MobileArtistaModule) },
]}];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class MobileLayoutRoutingModule {}
