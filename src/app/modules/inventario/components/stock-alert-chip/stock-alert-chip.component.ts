import { Component, Input } from '@angular/core';
import { esStockBajo } from '../../utils/stock-calculation.utils';

@Component({
  selector: 'app-stock-alert-chip',
  templateUrl: './stock-alert-chip.component.html',
  styleUrls: ['./stock-alert-chip.component.scss'],
  standalone: false,
})
export class StockAlertChipComponent {
  @Input() stockActual = 0;
  @Input() stockMinimo = 0;

  isLowStock(): boolean {
    return esStockBajo(this.stockActual, this.stockMinimo);
  }
}
