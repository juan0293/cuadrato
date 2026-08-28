import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-stock-status-chip',
  templateUrl: './stock-status-chip.component.html',
  styleUrls: ['./stock-status-chip.component.scss'],
  standalone: false,
})
export class StockStatusChipComponent {
  @Input() stockActual = 0;
  @Input() stockMinimo?: number;
  @Input() manejaInventario = false;

  label(): string {
    if (!this.manejaInventario) return 'No inventariable';
    if ((this.stockMinimo ?? 0) <= 0) return 'Sin mínimo';
    if (this.stockActual <= (this.stockMinimo ?? 0)) return 'Stock bajo';
    return 'Stock normal';
  }

  cssClass(): string {
    if (!this.manejaInventario) return 'neutral';
    if (this.stockActual <= (this.stockMinimo ?? 0)) return 'danger';
    return 'success';
  }
}
