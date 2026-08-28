import { Component, Input } from '@angular/core';
import { estadoFacturaColor, estadoFacturaLabel } from '../../helpers/facturacion.helper';
import { Factura } from '../../models/factura.model';

@Component({
  selector: 'app-factura-status-chip',
  templateUrl: './factura-status-chip.component.html',
  styleUrls: ['./factura-status-chip.component.scss'],
  standalone: false,
})
export class FacturaStatusChipComponent {
  @Input() estado!: Factura['estado'];

  label = estadoFacturaLabel;
  color = estadoFacturaColor;
}
