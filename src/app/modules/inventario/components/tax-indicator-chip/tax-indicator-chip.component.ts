import { Component, Input } from '@angular/core';
import { IndicadorFacturacion } from '../../models/producto-servicio.model';

@Component({
  selector: 'app-tax-indicator-chip',
  templateUrl: './tax-indicator-chip.component.html',
  styleUrls: ['./tax-indicator-chip.component.scss'],
  standalone: false,
})
export class TaxIndicatorChipComponent {
  @Input({ required: true }) indicador!: IndicadorFacturacion;

  label(): string {
    const map: Record<IndicadorFacturacion, string> = {
      0: 'No facturable',
      1: 'ITBIS 18%',
      2: 'ITBIS 16%',
      3: 'ITBIS 0%',
      4: 'Exento',
    };
    return map[this.indicador];
  }

  cssClass(): string {
    if (this.indicador === 1) return 'tax-18';
    if (this.indicador === 2) return 'tax-16';
    if (this.indicador === 3) return 'tax-0';
    if (this.indicador === 4) return 'tax-exento';
    return 'tax-no-facturable';
  }
}
