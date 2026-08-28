import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton-card',
  templateUrl: './skeleton-card.component.html',
  styleUrls: ['./skeleton-card.component.scss'],
  standalone: false,
})
export class SkeletonCardComponent {
  @Input() lines = 3;
}
