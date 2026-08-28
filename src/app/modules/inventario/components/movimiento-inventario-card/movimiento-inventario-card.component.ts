import { Component, Input } from '@angular/core';
import { MovimientoInventario } from '../../models/movimiento-inventario.model';

@Component({
  selector: 'app-movimiento-inventario-card',
  templateUrl: './movimiento-inventario-card.component.html',
  styleUrls: ['./movimiento-inventario-card.component.scss'],
  standalone: false,
})
export class MovimientoInventarioCardComponent {
  @Input() movimiento!: MovimientoInventario;
}
