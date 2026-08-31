import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AdminLayoutPage } from './admin-layout.page';
import { AdminLayoutRoutingModule } from './admin-layout-routing.module';
import { AdminShellThemeService } from '../../core/services/admin-shell-theme.service';

@NgModule({ declarations: [AdminLayoutPage], imports: [CommonModule, IonicModule, AdminLayoutRoutingModule] })
export class AdminLayoutModule {
  constructor(themeService: AdminShellThemeService) {
    themeService.initialize();
  }
}
