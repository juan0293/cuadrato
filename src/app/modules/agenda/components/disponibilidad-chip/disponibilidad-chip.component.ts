import { Component, Input } from '@angular/core';
import { DisponibilidadArtista } from '../../models/disponibilidad-artista.model';

@Component({
  selector: 'app-disponibilidad-chip',
  templateUrl: './disponibilidad-chip.component.html',
  styleUrls: ['./disponibilidad-chip.component.scss'],
  standalone: false,
})
export class DisponibilidadChipComponent {
  @Input() disponibilidad!: DisponibilidadArtista;
}
