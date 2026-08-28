import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { Usuario } from '../../../core/models/usuario.model';
import { LoginCredentials } from '../models/login-credentials.model';

@Injectable({ providedIn: 'root' })
export class AuthFacadeService {
  constructor(private readonly authService: AuthService) {}

  /**
   * Encapsula el caso de uso de login para mantener la página desacoplada
   * de la implementación de autenticación (Firebase/AuthCore).
   */
  login(credentials: LoginCredentials): Promise<void> {
    return this.authService.login(credentials.email, credentials.password);
  }

  logout(): Promise<void> {
    return this.authService.logout();
  }

  userProfile$(): Observable<Usuario | null> {
    return this.authService.userProfile$();
  }
}
