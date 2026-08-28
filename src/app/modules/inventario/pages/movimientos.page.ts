import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { MovimientoInventario } from '../models/movimiento-inventario.model';
import { MovimientosInventarioService } from '../services/movimientos-inventario.service';

@Component({
  standalone: false,
  selector: 'app-movimientos-page',
  templateUrl: './movimientos.page.html',
  styleUrls: ['./movimientos.page.scss'],
})
export class MovimientosPage {
  readonly movimientos$: Observable<MovimientoInventario[]> = this.movimientosService.list();

  constructor(private readonly movimientosService: MovimientosInventarioService) {}
}
