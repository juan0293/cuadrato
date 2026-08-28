import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { PerfilPage } from './pages/perfil.page';
import { PerfilRoutingModule } from './perfil-routing.module';

@NgModule({
  declarations: [PerfilPage],
  imports: [CommonModule, IonicModule, PerfilRoutingModule],
})
export class PerfilModule {}
