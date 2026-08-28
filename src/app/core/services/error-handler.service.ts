import { ErrorHandler, Injectable } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  constructor(private readonly toastService: ToastService) {}

  /**
   * Punto central de errores no controlados para evitar fallos silenciosos en operación.
   */
  handleError(error: unknown): void {
    console.error('Unhandled application error:', error);
    //this.toastService.error('Ocurrió un error inesperado. Intenta nuevamente.');
  }
}
