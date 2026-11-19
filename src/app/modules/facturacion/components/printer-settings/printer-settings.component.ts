import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { PrinterDevice } from '@devlas/capacitor-thermal-printer';
import {
  InvoicePrintFormat,
  PrinterConfiguration,
  PrinterTransport,
  WebSerialFlowControl,
} from '../../models/printer-configuration.model';
import { PrinterConfigurationService } from '../../services/printer-configuration.service';
import { QzSerialPrinterService } from '../../services/qz-serial-printer.service';
import { ThermalPrinterService } from '../../services/thermal-printer.service';
import { WebSerialPrinterService } from '../../services/web-serial-printer.service';
import { WebUsbPrinterService } from '../../services/web-usb-printer.service';

interface SelectablePrinter {
  id: string;
  name: string;
  transport: 'bluetooth' | 'usb' | 'tcp' | 'qz' | 'qz-printer' | 'webusb';
  address?: string;
  vendorId?: number;
  productId?: number;
  host?: string;
  port?: number;
  serialPort?: string;
  queueName?: string;
  serialNumber?: string;
}

@Component({
  standalone: false,
  selector: 'app-printer-settings',
  templateUrl: './printer-settings.component.html',
  styleUrls: ['./printer-settings.component.scss'],
})
export class PrinterSettingsComponent implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<PrinterConfiguration>();

  readonly form = this.fb.nonNullable.group({
    enabled: [true],
    autoPrintAfterInvoice: [true],
    format: ['ticket58' as InvoicePrintFormat, [Validators.required]],
    transport: ['bluetooth' as PrinterTransport, [Validators.required]],
    printerName: [''],
    bluetoothAddress: [''],
    usbVendorId: [0],
    usbProductId: [0],
    networkHost: [''],
    networkPort: [9100, [Validators.min(1), Validators.max(65535)]],
    webSerialBaudRate: [9600, [Validators.min(300), Validators.max(921600)]],
    webSerialFlowControl: ['none' as WebSerialFlowControl],
    webSerialUsbVendorId: [0],
    webSerialUsbProductId: [0],
    webSerialBluetoothServiceClassId: [''],
    qzSerialPort: [''],
    qzPrinterName: [''],
    webUsbVendorId: [0],
    webUsbProductId: [0],
    webUsbSerialNumber: [''],
    copies: [1, [Validators.min(1), Validators.max(5)]],
    cutPaper: [false],
  });

  printers: SelectablePrinter[] = [];
  selectedPrinterId = '';
  loading = true;
  searching = false;
  testing = false;
  saving = false;
  feedback = '';
  feedbackType: 'success' | 'error' | 'info' = 'info';
  webSerialIdentityAvailable = true;
  private webSerialSelectionMode: 'bluetooth-spp' | 'usb-com' = 'bluetooth-spp';

  constructor(
    private readonly fb: FormBuilder,
    private readonly configurationService: PrinterConfigurationService,
    readonly thermalPrinterService: ThermalPrinterService,
    readonly webSerialPrinterService: WebSerialPrinterService,
    readonly webUsbPrinterService: WebUsbPrinterService,
    readonly qzSerialPrinterService: QzSerialPrinterService,
  ) {}

  async ngOnInit(): Promise<void> {
    const configuration = await this.configurationService.load();
    this.form.patchValue({
      ...configuration,
      printerName: configuration.printerName || '',
      bluetoothAddress: configuration.bluetoothAddress || '',
      usbVendorId: configuration.usbVendorId || 0,
      usbProductId: configuration.usbProductId || 0,
      networkHost: configuration.networkHost || '',
      webSerialBaudRate: configuration.webSerialBaudRate || 9600,
      webSerialFlowControl: configuration.webSerialFlowControl || 'none',
      webSerialUsbVendorId: configuration.webSerialUsbVendorId || 0,
      webSerialUsbProductId: configuration.webSerialUsbProductId || 0,
      webSerialBluetoothServiceClassId: configuration.webSerialBluetoothServiceClassId || '',
      qzSerialPort: configuration.qzSerialPort || '',
      qzPrinterName: configuration.qzPrinterName || '',
      webUsbVendorId: configuration.webUsbVendorId || 0,
      webUsbProductId: configuration.webUsbProductId || 0,
      webUsbSerialNumber: configuration.webUsbSerialNumber || '',
    });
    if (!this.isNative && !['qz', 'qz-printer', 'webserial', 'webusb', 'browser', 'system'].includes(this.form.controls.transport.value)) {
      this.form.controls.transport.setValue('webserial');
      this.form.controls.printerName.setValue('');
    }
    this.loading = false;

    this.form.controls.format.valueChanges.subscribe((format) => {
      if (format === 'letter') this.form.controls.transport.setValue('system');
      if (format !== 'letter' && this.form.controls.transport.value === 'system') {
        this.form.controls.transport.setValue(this.isNative ? 'bluetooth' : 'webserial');
      }
      this.printers = [];
      this.selectedPrinterId = '';
    });

    this.form.controls.transport.valueChanges.subscribe(() => {
      if (this.form.controls.transport.value === 'qz') {
        this.form.controls.webSerialFlowControl.setValue('none');
      }
      this.printers = [];
      this.selectedPrinterId = '';
      this.feedback = '';
    });
  }

  get isLetter(): boolean {
    return this.form.controls.format.value === 'letter';
  }

  get canSearch(): boolean {
    return this.isNative
      ? ['bluetooth', 'usb', 'tcp'].includes(this.form.controls.transport.value)
      : ['qz', 'qz-printer'].includes(this.form.controls.transport.value)
        || (this.form.controls.transport.value === 'webusb' && this.webUsbPrinterService.supported)
        || (this.form.controls.transport.value === 'webserial' && this.webSerialPrinterService.supported);
  }

  get searchButtonLabel(): string {
    if (this.searching) return 'Buscando…';
    if (this.isNative) return 'Buscar impresoras';
    if (this.form.controls.transport.value === 'qz') return 'Buscar puertos con QZ Tray';
    if (this.form.controls.transport.value === 'qz-printer') return 'Buscar impresoras del sistema';
    if (this.form.controls.transport.value === 'webusb') return 'Autorizar impresora USB';
    return 'Seleccionar Bluetooth SPP';
  }

  get isNative(): boolean {
    return this.thermalPrinterService.isNative;
  }

  async searchPrinters(webMode: 'bluetooth-spp' | 'usb-com' = 'bluetooth-spp'): Promise<void> {
    if (!this.canSearch) return;
    this.searching = true;
    this.feedback = '';
    this.printers = [];

    try {
      const transport = this.form.controls.transport.value;
      if (!this.isNative && transport === 'qz') {
        const ports = await this.qzSerialPrinterService.findPorts();
        this.printers = ports.map((port) => ({
          id: `qz-${port}`,
          name: port,
          transport: 'qz',
          serialPort: port,
        }));
      }
      if (!this.isNative && transport === 'qz-printer') {
        const printers = await this.qzSerialPrinterService.findPrinters();
        this.printers = printers.map((printer) => ({
          id: `qz-printer-${printer}`,
          name: printer,
          transport: 'qz-printer',
          queueName: printer,
        }));
      }
      if (!this.isNative && transport === 'webusb') {
        const selection = await this.webUsbPrinterService.selectPrinter();
        this.printers = [{
          id: `webusb-${selection.vendorId}-${selection.productId}-${selection.serialNumber || ''}`,
          name: `${selection.name} · USB directo`,
          transport: 'webusb',
          vendorId: selection.vendorId,
          productId: selection.productId,
          serialNumber: selection.serialNumber,
        }];
        this.selectPrinter(this.printers[0].id);
      }
      if (!this.isNative && transport === 'webserial') {
        this.webSerialSelectionMode = webMode;
        const selection = await this.webSerialPrinterService.selectPrinter(webMode);
        this.form.patchValue({
          printerName: selection.name,
          webSerialUsbVendorId: selection.usbVendorId || 0,
          webSerialUsbProductId: selection.usbProductId || 0,
          webSerialBluetoothServiceClassId: selection.bluetoothServiceClassId || '',
        });
        this.webSerialIdentityAvailable = selection.identityAvailable;
        this.setFeedback(
          selection.identityAvailable
            ? 'Puerto autorizado. Ya puedes ejecutar la prueba.'
            : 'Puerto autorizado sin identidad. Confirma que elegiste el puerto COM saliente de la 2C-P58-C.',
          selection.identityAvailable ? 'success' : 'info',
        );
        return;
      }
      if (transport === 'bluetooth' || transport === 'usb') {
        const devices = await this.thermalPrinterService.listDevices(transport);
        this.printers = devices
          .filter((device) => transport !== 'usb' || device.canPrint !== false)
          .map((device, index) => this.mapDevice(device, index));
      } else if (transport === 'tcp') {
        const devices = await this.thermalPrinterService.discoverNetworkPrinters();
        this.printers = devices.map((device) => ({
          id: `tcp-${device.host}-${device.port}`,
          name: `${device.name} · ${device.host}:${device.port}`,
          transport: 'tcp',
          host: device.host,
          port: device.port,
        }));
      }

      this.setFeedback(
        this.printers.length
          ? `Se encontraron ${this.printers.length} impresora(s).`
          : 'No se encontraron impresoras. Verifica la conexión y vuelve a buscar.',
        this.printers.length ? 'success' : 'info',
      );
    } catch (error) {
      const errorName = String((error as { name?: unknown })?.name || '');
      const message = !this.isNative
        && this.webSerialSelectionMode === 'bluetooth-spp'
        && errorName === 'NotFoundError'
        ? 'Chrome no encontró un puerto Bluetooth SPP 0x1101. El servicio PnP 0x1200 de la impresora está bloqueado y no se puede autorizar desde una PWA.'
        : this.getFriendlyError(error);
      this.setFeedback(message, 'error');
    } finally {
      this.searching = false;
    }
  }

  selectPrinter(id: string): void {
    this.selectedPrinterId = id;
    const printer = this.printers.find((item) => item.id === id);
    if (!printer) return;
    this.form.patchValue({
      printerName: printer.name,
      bluetoothAddress: printer.address || '',
      usbVendorId: printer.vendorId || 0,
      usbProductId: printer.productId || 0,
      networkHost: printer.host || '',
      networkPort: printer.port || 9100,
      qzSerialPort: printer.serialPort || '',
      qzPrinterName: printer.queueName || '',
      webUsbVendorId: printer.transport === 'webusb' ? printer.vendorId || 0 : 0,
      webUsbProductId: printer.transport === 'webusb' ? printer.productId || 0 : 0,
      webUsbSerialNumber: printer.transport === 'webusb' ? printer.serialNumber || '' : '',
    });
  }

  async testPrint(): Promise<void> {
    this.testing = true;
    this.feedback = '';
    try {
      const configuration = this.buildConfiguration();
      if (configuration.format === 'letter') {
        this.setFeedback('La prueba Letter se realiza al imprimir una factura mediante el diálogo del sistema.', 'info');
        return;
      }
      if (!this.isNative && configuration.transport === 'browser') {
        this.setFeedback('El controlador del sistema se probará al imprimir una factura real.', 'info');
        return;
      }
      if (this.isNative) await this.thermalPrinterService.printTest(configuration);
      else if (configuration.transport === 'qz' || configuration.transport === 'qz-printer') {
        await this.qzSerialPrinterService.printTest(configuration);
      }
      else if (configuration.transport === 'webusb') await this.webUsbPrinterService.printTest(configuration);
      else await this.webSerialPrinterService.printTest(configuration);
      this.setFeedback(
        configuration.transport === 'qz-printer'
          ? 'QZ Tray entregó la prueba a la cola de impresión. Confirma que la hoja salió físicamente.'
          : configuration.transport === 'webusb'
            ? 'La prueba fue enviada directamente al dispositivo USB, sin pasar por QZ Tray.'
          : 'Los datos ESC/POS fueron enviados al puerto. Confirma que la hoja salió físicamente; el canal serial no recibe confirmación de papel.',
        'success',
      );
    } catch (error) {
      this.setFeedback(this.getFriendlyError(error), 'error');
    } finally {
      this.testing = false;
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.setFeedback('Revisa los valores de la configuración.', 'error');
      return;
    }

    this.saving = true;
    try {
      const configuration = this.buildConfiguration();
      if (configuration.format !== 'letter' && this.isNative) {
        this.thermalPrinterService.validateThermalConfiguration(configuration);
      }
      if (configuration.format !== 'letter' && !this.isNative
        && configuration.transport === 'webserial' && !configuration.printerName) {
        throw new Error('WEB_SERIAL_NOT_SELECTED');
      }
      if (configuration.format !== 'letter' && !this.isNative
        && configuration.transport === 'qz' && !configuration.qzSerialPort) {
        throw new Error('QZ_PORT_NOT_SELECTED');
      }
      if (configuration.format !== 'letter' && !this.isNative
        && configuration.transport === 'qz-printer' && !configuration.qzPrinterName) {
        throw new Error('QZ_PRINTER_NOT_SELECTED');
      }
      if (configuration.format !== 'letter' && !this.isNative
        && configuration.transport === 'webusb' && (!configuration.webUsbVendorId || !configuration.webUsbProductId)) {
        throw new Error('WEB_USB_NOT_SELECTED');
      }
      const stored = await this.configurationService.save(configuration);
      this.saved.emit(stored);
      this.setFeedback('Configuración guardada en esta terminal.', 'success');
    } catch (error) {
      this.setFeedback(this.getFriendlyError(error), 'error');
    } finally {
      this.saving = false;
    }
  }

  private buildConfiguration(): PrinterConfiguration {
    const value = this.form.getRawValue();
    return {
      enabled: value.enabled,
      autoPrintAfterInvoice: value.autoPrintAfterInvoice,
      format: value.format,
      transport: value.format === 'letter' ? 'system' : value.transport,
      printerName: value.format === 'letter' ? 'Impresora del sistema' : value.printerName.trim() || undefined,
      bluetoothAddress: value.bluetoothAddress.trim() || undefined,
      usbVendorId: value.usbVendorId > 0 ? Number(value.usbVendorId) : undefined,
      usbProductId: value.usbProductId > 0 ? Number(value.usbProductId) : undefined,
      networkHost: value.networkHost.trim() || undefined,
      networkPort: Number(value.networkPort || 9100),
      webSerialBaudRate: Number(value.webSerialBaudRate || 9600),
      webSerialFlowControl: value.webSerialFlowControl,
      webSerialUsbVendorId: value.webSerialUsbVendorId > 0 ? Number(value.webSerialUsbVendorId) : undefined,
      webSerialUsbProductId: value.webSerialUsbProductId > 0 ? Number(value.webSerialUsbProductId) : undefined,
      webSerialBluetoothServiceClassId: value.webSerialBluetoothServiceClassId.trim() || undefined,
      qzSerialPort: value.qzSerialPort.trim() || undefined,
      qzPrinterName: value.qzPrinterName.trim() || undefined,
      webUsbVendorId: value.webUsbVendorId > 0 ? Number(value.webUsbVendorId) : undefined,
      webUsbProductId: value.webUsbProductId > 0 ? Number(value.webUsbProductId) : undefined,
      webUsbSerialNumber: value.webUsbSerialNumber.trim() || undefined,
      copies: Number(value.copies || 1),
      cutPaper: value.cutPaper,
    };
  }

  private mapDevice(device: PrinterDevice, index: number): SelectablePrinter {
    if (device.transport === 'bluetooth') {
      return {
        id: `bluetooth-${device.address || index}`,
        name: `${device.name || 'Impresora Bluetooth'}${device.address ? ` · ${device.address}` : ''}`,
        transport: 'bluetooth',
        address: device.address,
      };
    }
    return {
      id: `usb-${device.vendorId || 0}-${device.productId || 0}-${index}`,
      name: `${device.name || 'Impresora USB'} · VID ${device.vendorId || '—'} / PID ${device.productId || '—'}`,
      transport: 'usb',
      vendorId: device.vendorId,
      productId: device.productId,
    };
  }

  private setFeedback(message: string, type: 'success' | 'error' | 'info'): void {
    this.feedback = message;
    this.feedbackType = type;
  }

  private getFriendlyError(error: unknown): string {
    if (!this.isNative && ['qz', 'qz-printer'].includes(this.form.controls.transport.value)) {
      return this.qzSerialPrinterService.getFriendlyError(error);
    }
    if (!this.isNative && this.form.controls.transport.value === 'webusb') {
      return this.webUsbPrinterService.getFriendlyError(error);
    }
    return this.isNative
      ? this.thermalPrinterService.getFriendlyError(error)
      : this.webSerialPrinterService.getFriendlyError(error);
  }
}
