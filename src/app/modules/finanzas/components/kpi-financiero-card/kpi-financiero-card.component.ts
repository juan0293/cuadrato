import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-financiero-card',
  templateUrl: './kpi-financiero-card.component.html',
  styleUrls: ['./kpi-financiero-card.component.scss'],
  standalone: false,
})
export class KpiFinancieroCardComponent {
  @Input() title = '';
  @Input() value = '';
  @Input() color: 'success' | 'danger' | 'primary' | 'medium' = 'primary';
}
