import { Component, Input } from '@angular/core';
import { Cita } from '../../models/cita.model';
import { obtenerColorEstadoCita, obtenerEstadoCitaLabel } from '../../helpers/agenda.helper';

@Component({
  selector: 'app-cita-card',
  templateUrl: './cita-card.component.html',
  styleUrls: ['./cita-card.component.scss'],
  standalone: false,
})
export class CitaCardComponent {
  @Input() cita!: Cita;

  estadoLabel = obtenerEstadoCitaLabel;
  estadoColor = obtenerColorEstadoCita;
}
