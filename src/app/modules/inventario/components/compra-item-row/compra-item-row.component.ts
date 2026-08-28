import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CompraItem } from '../../models/compra-item.model';

@Component({
  selector: 'app-compra-item-row',
  templateUrl: './compra-item-row.component.html',
  styleUrls: ['./compra-item-row.component.scss'],
  standalone: false,
})
export class CompraItemRowComponent {
  @Input({ required: true }) item!: CompraItem;
  @Input() removable = false;
  @Output() remove = new EventEmitter<void>();

  onRemove(): void {
    this.remove.emit();
  }
}
