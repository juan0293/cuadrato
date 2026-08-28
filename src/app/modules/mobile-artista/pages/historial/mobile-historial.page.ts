import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Cita } from '../../../agenda/models/cita.model';
import { MobileArtistaService } from '../../services/mobile-artista.service';

@Component({
  selector: 'app-mobile-historial',
  templateUrl: './mobile-historial.page.html',
  styleUrls: ['./mobile-historial.page.scss'],
  standalone: false,
})
export class MobileHistorialPage {
  readonly historial$: Observable<Cita[]> = this.mobileArtistaService.historialCitas$();

  constructor(private readonly mobileArtistaService: MobileArtistaService) {}
}
