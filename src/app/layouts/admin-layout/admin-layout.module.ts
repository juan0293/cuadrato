import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AdminLayoutPage } from './admin-layout.page';
import { AdminLayoutRoutingModule } from './admin-layout-routing.module';

@NgModule({ declarations: [AdminLayoutPage], imports: [CommonModule, IonicModule, AdminLayoutRoutingModule] })
export class AdminLayoutModule {}
