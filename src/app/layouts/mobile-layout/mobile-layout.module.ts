import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { MobileLayoutPage } from './mobile-layout.page';
import { MobileLayoutRoutingModule } from './mobile-layout-routing.module';

@NgModule({ declarations: [MobileLayoutPage], imports: [CommonModule, IonicModule, MobileLayoutRoutingModule] })
export class MobileLayoutModule {}
