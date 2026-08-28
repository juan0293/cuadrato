import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { MovimientoInventario } from '../../models/movimiento-inventario.model';
import { MovimientosInventarioService } from '../../services/movimientos-inventario.service';

@Component({
  selector: 'app-decomisos',
  templateUrl: './decomisos.page.html',
  styleUrls: ['./decomisos.page.scss'],
  standalone: false,
})
export class DecomisosPage {
  readonly decomisos$: Observable<MovimientoInventario[]> = this.movimientosService.list().pipe(
    map((items) =>
      items
        .filter((x) => ['decomiso', 'averia', 'vencimiento', 'uso_interno', 'robo', 'perdida', 'merma', 'ajuste_fisico'].includes(x.tipoMovimiento || ''))
        .sort((a, b) => (a.fecha > b.fecha ? -1 : 1)),
    ),
  );

  constructor(
    private readonly movimientosService: MovimientosInventarioService,
    private readonly router: Router,
  ) {}

  goToNew(): void {
    this.router.navigateByUrl('/admin/inventario/decomisos/nuevo');
  }

  movimientoLabel(tipo?: string): string {
    const labels: Record<string, string> = {
      decomiso: 'Decomiso',
      averia: 'Avería',
      vencimiento: 'Vencimiento',
      uso_interno: 'Uso interno',
      robo: 'Robo',
      perdida: 'Pérdida',
      merma: 'Merma',
      ajuste_fisico: 'Ajuste físico',
    };
    return labels[tipo || ''] || 'Ajuste';
  }
}
