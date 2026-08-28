import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DashboardPage } from './pages/dashboard.page';
import { DashboardRoutingModule } from './dashboard-routing.module';

@NgModule({ declarations: [DashboardPage], imports: [CommonModule, FormsModule, IonicModule, DashboardRoutingModule] })
export class DashboardModule {}
