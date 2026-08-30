import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { FinanzasPage } from './pages/finanzas.page';
import { FinanzasRoutingModule } from './finanzas-routing.module';
import { MovimientoFinancieroFormPage } from './pages/movimiento-financiero-form.page';
import { MovimientosFinancierosPage } from './pages/movimientos-financieros.page';
import { KpiFinancieroCardComponent } from './components/kpi-financiero-card/kpi-financiero-card.component';
import { FinanceChartComponent } from './components/finance-chart/finance-chart.component';
import { FinanzasThemeService } from './services/finanzas-theme.service';

@NgModule({
  declarations: [
    FinanzasPage,
    MovimientoFinancieroFormPage,
    MovimientosFinancierosPage,
    KpiFinancieroCardComponent,
    FinanceChartComponent,
  ],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, SharedModule, FinanzasRoutingModule],
})
export class FinanzasModule {
  constructor(themeService: FinanzasThemeService) {
    themeService.initialize();
  }
}
