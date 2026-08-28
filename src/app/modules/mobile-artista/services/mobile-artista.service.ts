import { Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { Cita } from '../../agenda/models/cita.model';
import { AgendaService } from '../../agenda/services/agenda.service';
import { MovimientoFinanciero } from '../../finanzas/models/movimiento-financiero.model';
import { FinanzasService } from '../../finanzas/services/finanzas.service';
import { Insumo } from '../../inventario/models/insumo.model';
import { MovimientoInventario } from '../../inventario/models/movimiento-inventario.model';
import { InventarioService } from '../../inventario/services/inventario.service';
import { MovimientosInventarioService } from '../../inventario/services/movimientos-inventario.service';
import { MobileArtistaResumen } from '../models/mobile-artista-resumen.model';
import { ordenarCitas } from '../helpers/mobile-artista.helper';
import { monthKeyISO, todayISO } from '../utils/mobile-artista-date.utils';

@Injectable({ providedIn: 'root' })
export class MobileArtistaService {
  constructor(
    private readonly authService: AuthService,
    private readonly agendaService: AgendaService,
    private readonly inventarioService: InventarioService,
    private readonly movimientosInventarioService: MovimientosInventarioService,
    private readonly finanzasService: FinanzasService,
  ) {}

  citasPropias$(): Observable<Cita[]> {
    return combineLatest([this.authService.user$, this.agendaService.list()]).pipe(
      map(([user, citas]) => {
        if (!user?.uid) return [];
        return ordenarCitas(citas.filter((item) => item.artistaId === user.uid));
      }),
    );
  }

  proximasCitas$(): Observable<Cita[]> {
    const hoy = todayISO();
    return this.citasPropias$().pipe(map((items) => items.filter((item) => item.fecha >= hoy)));
  }

  historialCitas$(): Observable<Cita[]> {
    return this.citasPropias$().pipe(map((items) => items.filter((item) => item.estado === 'completada' || item.fecha < todayISO())));
  }

  insumosActivos$(): Observable<Insumo[]> {
    return this.inventarioService.list().pipe(map((items) => items.filter((item) => item.activo)));
  }

  movimientosPropios$(): Observable<MovimientoInventario[]> {
    return combineLatest([this.authService.user$, this.movimientosInventarioService.list()]).pipe(
      map(([user, moves]) => {
        if (!user?.uid) return [];
        return moves.filter((item) => item.artistaId === user.uid);
      }),
    );
  }

  ingresosPropios$(): Observable<MovimientoFinanciero[]> {
    return combineLatest([this.authService.user$, this.finanzasService.list()]).pipe(
      map(([user, moves]) => {
        if (!user?.uid) return [];
        return moves.filter((item) => item.tipo === 'ingreso' && item.artistaId === user.uid);
      }),
    );
  }

  /**
   * Consolida resumen diario/mensual del artista para la home móvil.
   * Mantiene las agregaciones fuera de la capa de UI para facilitar pruebas y evolución.
   */
  resumen$(): Observable<MobileArtistaResumen> {
    return combineLatest([this.proximasCitas$(), this.movimientosPropios$(), this.ingresosPropios$()]).pipe(
      map(([citas, movimientos, ingresos]) => {
        const hoy = todayISO();
        const monthKey = monthKeyISO();
        return {
          fecha: hoy,
          citasHoy: citas.filter((item) => item.fecha === hoy).length,
          citasPendientes: citas.filter((item) => item.estado === 'programada' || item.estado === 'confirmada').length,
          insumosConsumidosHoy: movimientos
            .filter((item) => item.tipo === 'salida' && item.fecha.startsWith(hoy))
            .reduce((acc, item) => acc + item.cantidad, 0),
          ingresosPropiosMes: ingresos
            .filter((item) => item.fecha.startsWith(monthKey))
            .reduce((acc, item) => acc + item.monto, 0),
        };
      }),
    );
  }
}
