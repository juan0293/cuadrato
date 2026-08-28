import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { MobileArtistaPage } from './pages/mobile-artista.page';
import { MobileArtistaRoutingModule } from './mobile-artista-routing.module';
import { AgendaModule } from '../agenda/agenda.module';
import { MobileHomePage } from './pages/home/mobile-home.page';
import { MobileCitasPage } from './pages/citas/mobile-citas.page';
import { MobileConsumoPage } from './pages/consumo/mobile-consumo.page';
import { MobileHistorialPage } from './pages/historial/mobile-historial.page';
import { ResumenCardComponent } from './components/resumen-card/resumen-card.component';

@NgModule({
  declarations: [
    MobileArtistaPage,
    MobileHomePage,
    MobileCitasPage,
    MobileConsumoPage,
    MobileHistorialPage,
    ResumenCardComponent,
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, SharedModule, MobileArtistaRoutingModule, AgendaModule],
})
export class MobileArtistaModule {}
