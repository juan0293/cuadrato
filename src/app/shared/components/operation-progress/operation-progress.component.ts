import { Component, Input, ViewChild } from '@angular/core';
import { IonModal } from '@ionic/angular';
import { AdminShellThemeService } from '../../../core/services/admin-shell-theme.service';

@Component({
  selector: 'app-operation-progress',
  standalone: false,
  templateUrl: './operation-progress.component.html',
  // Comparte la identidad visual del inicio: logo, tarjeta, colores y progreso.
  styleUrls: ['../../../app.component.scss'],
})
export class OperationProgressComponent {
  @Input() open = false;
  @Input() title = 'Procesando operación';
  @Input() message = 'Estamos registrando la información.';
  @Input() stage = 'Procesando';
  @ViewChild(IonModal) private modal?: IonModal;

  readonly canDismiss = () => !this.open;

  constructor(readonly themeService: AdminShellThemeService) {}

  async hide(): Promise<void> {
    this.open = false;
    await this.modal?.dismiss();
  }
}
