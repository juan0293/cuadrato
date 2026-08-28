import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { FacturacionPage } from './pages/facturacion.page';
import { FacturacionRoutingModule } from './facturacion-routing.module';
import { FacturaFormPage } from './pages/factura-form.page';
import { FacturaStatusChipComponent } from './components/factura-status-chip/factura-status-chip.component';
import { FacturaItemRowComponent } from './components/factura-item-row/factura-item-row.component';
import { CuentasPorCobrarPage } from './pages/cuentas-por-cobrar/cuentas-por-cobrar.page';
import { CompanyProfilePage } from './pages/company-profile/company-profile.page';

@NgModule({
  declarations: [FacturacionPage, FacturaFormPage, FacturaStatusChipComponent, FacturaItemRowComponent, CuentasPorCobrarPage, CompanyProfilePage],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, SharedModule, FacturacionRoutingModule],
})
export class FacturacionModule {}
