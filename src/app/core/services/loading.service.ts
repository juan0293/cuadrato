import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private loading?: HTMLIonLoadingElement;

  constructor(private readonly loadingController: LoadingController) {}

  async show(message = 'Procesando...'): Promise<void> {
    this.loading = await this.loadingController.create({ message });
    await this.loading.present();
  }

  async hide(): Promise<void> {
    if (this.loading) {
      await this.loading.dismiss();
      this.loading = undefined;
    }
  }
}
