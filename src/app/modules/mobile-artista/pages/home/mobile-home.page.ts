import { Component } from '@angular/core';
import { map } from 'rxjs';
import { formatCurrencyDOP } from '../../../../core/utils/currency.utils';
import { MobileArtistaService } from '../../services/mobile-artista.service';

@Component({
  selector: 'app-mobile-home',
  templateUrl: './mobile-home.page.html',
  styleUrls: ['./mobile-home.page.scss'],
  standalone: false,
})
export class MobileHomePage {
  readonly resumen$ = this.mobileArtistaService.resumen$().pipe(
    map((r) => ({ ...r, ingresosPropiosMesLabel: formatCurrencyDOP(r.ingresosPropiosMes) })),
  );

  constructor(private readonly mobileArtistaService: MobileArtistaService) {}
}
