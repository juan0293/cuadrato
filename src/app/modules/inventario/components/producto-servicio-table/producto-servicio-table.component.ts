import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProductoServicio } from '../../models/producto-servicio.model';

@Component({
  selector: 'app-producto-servicio-table',
  templateUrl: './producto-servicio-table.component.html',
  styleUrls: ['./producto-servicio-table.component.scss'],
  standalone: false,
})
export class ProductoServicioTableComponent {
  @Input() items: ProductoServicio[] = [];
  @Output() edit = new EventEmitter<ProductoServicio>();
}
