import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import {
  DEFAULT_PRINTER_CONFIGURATION,
  PrinterConfiguration,
} from '../models/printer-configuration.model';

@Injectable({ providedIn: 'root' })
export class PrinterConfigurationService {
  private readonly storageKey = 'facturacion-printer-configuration-v1';
  private readonly configurationSubject = new BehaviorSubject<PrinterConfiguration>({
    ...DEFAULT_PRINTER_CONFIGURATION,
  });
  private loaded = false;

  readonly configuration$ = this.configurationSubject.asObservable();

  async load(): Promise<PrinterConfiguration> {
    if (this.loaded) return this.configurationSubject.value;

    try {
      const { value } = await Preferences.get({ key: this.storageKey });
      const stored = value ? JSON.parse(value) as Partial<PrinterConfiguration> : undefined;
      this.configurationSubject.next(this.normalize(stored));
    } catch (error) {
      console.warn('[PrinterConfiguration] No se pudo leer la configuración local:', error);
      this.configurationSubject.next({ ...DEFAULT_PRINTER_CONFIGURATION });
    }

    this.loaded = true;
    return this.configurationSubject.value;
  }

  getSnapshot(): PrinterConfiguration {
    return this.configurationSubject.value;
  }

  async save(configuration: PrinterConfiguration): Promise<PrinterConfiguration> {
    const normalized = this.normalize(configuration);
    await Preferences.set({
      key: this.storageKey,
      value: JSON.stringify(normalized),
    });
    this.loaded = true;
    this.configurationSubject.next(normalized);
    return normalized;
  }

  describe(configuration = this.configurationSubject.value): string {
    const format = configuration.format === 'ticket58'
      ? '58 mm'
      : configuration.format === 'ticket80'
        ? '80 mm'
        : 'Carta 8.5×11';
    return configuration.printerName ? `${configuration.printerName} · ${format}` : format;
  }

  private normalize(value?: Partial<PrinterConfiguration>): PrinterConfiguration {
    const merged = { ...DEFAULT_PRINTER_CONFIGURATION, ...(value || {}) };
    return {
      ...merged,
      networkPort: this.clampInteger(merged.networkPort, 1, 65535, 9100),
      webSerialBaudRate: this.clampInteger(merged.webSerialBaudRate, 300, 921600, 9600),
      webSerialFlowControl: merged.webSerialFlowControl === 'hardware' ? 'hardware' : 'none',
      copies: this.clampInteger(merged.copies, 1, 5, 1),
      usbVendorId: this.optionalInteger(merged.usbVendorId),
      usbProductId: this.optionalInteger(merged.usbProductId),
      webSerialUsbVendorId: this.optionalInteger(merged.webSerialUsbVendorId),
      webSerialUsbProductId: this.optionalInteger(merged.webSerialUsbProductId),
      webUsbVendorId: this.optionalInteger(merged.webUsbVendorId),
      webUsbProductId: this.optionalInteger(merged.webUsbProductId),
      printerName: this.cleanText(merged.printerName),
      bluetoothAddress: this.cleanText(merged.bluetoothAddress),
      networkHost: this.cleanText(merged.networkHost),
      webSerialBluetoothServiceClassId: this.cleanText(merged.webSerialBluetoothServiceClassId),
      qzSerialPort: this.cleanText(merged.qzSerialPort),
      qzPrinterName: this.cleanText(merged.qzPrinterName),
      webUsbSerialNumber: this.cleanText(merged.webUsbSerialNumber),
      transport: merged.format === 'letter' ? 'system' : merged.transport,
    };
  }

  private clampInteger(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  }

  private optionalInteger(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private cleanText(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }
}
