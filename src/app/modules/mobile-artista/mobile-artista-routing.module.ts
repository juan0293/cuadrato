import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MobileHomePage } from './pages/home/mobile-home.page';
import { MobileCitasPage } from './pages/citas/mobile-citas.page';
import { MobileConsumoPage } from './pages/consumo/mobile-consumo.page';
import { MobileHistorialPage } from './pages/historial/mobile-historial.page';

const routes: Routes = [
  { path: 'home', component: MobileHomePage },
  { path: 'citas', component: MobileCitasPage },
  { path: 'consumo', component: MobileConsumoPage },
  { path: 'historial', component: MobileHistorialPage },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class MobileArtistaRoutingModule {}
