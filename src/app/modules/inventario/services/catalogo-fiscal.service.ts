import { Injectable } from '@angular/core';
import { IndicadorFacturacion, TipoItemInventario } from '../models/producto-servicio.model';
import { UnidadMedida } from '../models/unidad-medida.model';

export interface IndicadorFacturacionCatalogo {
  codigo: IndicadorFacturacion;
  nombre: string;
  tasaItbis: 0 | 16 | 18;
  esFacturable: boolean;
  esExento: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogoFiscalService {
  private readonly indicadores: IndicadorFacturacionCatalogo[] = [
    { codigo: 1, nombre: 'ITBIS 18%', tasaItbis: 18, esFacturable: true, esExento: false },
    { codigo: 2, nombre: 'ITBIS 16%', tasaItbis: 16, esFacturable: true, esExento: false },
    { codigo: 3, nombre: 'ITBIS 0%', tasaItbis: 0, esFacturable: true, esExento: false },
    { codigo: 4, nombre: 'Exento', tasaItbis: 0, esFacturable: true, esExento: true },
    { codigo: 0, nombre: 'No facturable', tasaItbis: 0, esFacturable: false, esExento: false },
  ];

  private readonly unidadesBase: UnidadMedida[] = [
    { id: 'ud', codigo: 'UD', nombre: 'Unidad', activo: true },
    { id: 'ml', codigo: 'ML', nombre: 'Mililitro', activo: true },
    { id: 'gr', codigo: 'GR', nombre: 'Gramo', activo: true },
    { id: 'hr', codigo: 'HR', nombre: 'Hora', activo: true },
    { id: 'srv', codigo: 'SRV', nombre: 'Servicio', activo: true },
  ];

  getIndicadoresFacturacion(): IndicadorFacturacionCatalogo[] {
    return [...this.indicadores];
  }

  getUnidadesMedidaBase(): UnidadMedida[] {
    return [...this.unidadesBase];
  }

  /**
   * Resuelve configuración tributaria por indicador para evitar
   * reglas duplicadas entre formularios, compras y futuras líneas e-CF.
   */
  resolveTaxByIndicador(indicador: IndicadorFacturacion): IndicadorFacturacionCatalogo {
    return this.indicadores.find((item) => item.codigo === indicador) ?? this.indicadores[4];
  }

  /**
   * Mapea tipo de ítem al estándar esperado por e-CF RD.
   * 1 = Bien, 2 = Servicio.
   */
  resolveIndicadorBienServicio(tipoItem: TipoItemInventario): 1 | 2 {
    return tipoItem === 'servicio' ? 2 : 1;
  }
}
