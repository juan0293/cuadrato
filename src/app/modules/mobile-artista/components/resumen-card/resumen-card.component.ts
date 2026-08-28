import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-resumen-card',
  templateUrl: './resumen-card.component.html',
  styleUrls: ['./resumen-card.component.scss'],
  standalone: false,
})
export class ResumenCardComponent {
  @Input() label = '';
  @Input() value = '';
}
