import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { UsuariosPage } from './pages/usuarios.page';
import { UsuariosRoutingModule } from './usuarios-routing.module';
import { UsuarioFormPage } from './pages/usuario-form.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [UsuariosPage, UsuarioFormPage],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, SharedModule, UsuariosRoutingModule],
})
export class UsuariosModule {}
