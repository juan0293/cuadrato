import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Cita } from '../../../agenda/models/cita.model';
import { MobileArtistaService } from '../../services/mobile-artista.service';

@Component({
  selector: 'app-mobile-citas',
  templateUrl: './mobile-citas.page.html',
  styleUrls: ['./mobile-citas.page.scss'],
  standalone: false,
})
export class MobileCitasPage {
  readonly citas$: Observable<Cita[]> = this.mobileArtistaService.proximasCitas$();

  constructor(private readonly mobileArtistaService: MobileArtistaService) {}
}
