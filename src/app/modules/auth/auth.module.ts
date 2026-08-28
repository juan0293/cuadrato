import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthPage } from './pages/auth.page';
import { AuthRoutingModule } from './auth-routing.module';
import { PerfilPage } from './pages/perfil.page';

@NgModule({
  declarations: [AuthPage, PerfilPage],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, AuthRoutingModule],
})
export class AuthModule {}
