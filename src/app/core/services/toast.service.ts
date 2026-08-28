import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private readonly toastController: ToastController) {}

  async success(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, color: 'success', duration: 2000, position: 'bottom' });
    await toast.present();
  }

  async error(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, color: 'danger', duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
