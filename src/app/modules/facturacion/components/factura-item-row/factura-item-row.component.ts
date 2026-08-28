import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FacturaItem } from '../../models/factura-item.model';

@Component({
  selector: 'app-factura-item-row',
  templateUrl: './factura-item-row.component.html',
  styleUrls: ['./factura-item-row.component.scss'],
  standalone: false,
})
export class FacturaItemRowComponent {
  @Input() item!: FacturaItem;
  @Output() remove = new EventEmitter<void>();
}
