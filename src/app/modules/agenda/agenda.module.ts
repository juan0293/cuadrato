import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { FullCalendarModule } from '@fullcalendar/angular';
import { SharedModule } from '../../shared/shared.module';
import { AgendaPage } from './pages/agenda.page';
import { AgendaRoutingModule } from './agenda-routing.module';
import { CitaCardComponent } from './components/cita-card/cita-card.component';
import { CitaFormPage } from './pages/cita-form.page';
import { DisponibilidadPage } from './pages/disponibilidad.page';
import { DisponibilidadChipComponent } from './components/disponibilidad-chip/disponibilidad-chip.component';

@NgModule({
  declarations: [AgendaPage, CitaCardComponent, CitaFormPage, DisponibilidadPage, DisponibilidadChipComponent],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, FullCalendarModule, SharedModule, AgendaRoutingModule],
  exports: [CitaCardComponent],
})
export class AgendaModule {}
