import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Insumo } from '../../models/insumo.model';

@Component({
  selector: 'app-insumo-card',
  templateUrl: './insumo-card.component.html',
  styleUrls: ['./insumo-card.component.scss'],
  standalone: false,
})
export class InsumoCardComponent {
  @Input() insumo!: Insumo;
  @Output() edit = new EventEmitter<string>();
}
