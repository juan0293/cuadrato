export type InvoicePrintFormat = 'ticket58' | 'ticket80' | 'letter';

export type PrinterTransport = 'bluetooth' | 'usb' | 'tcp' | 'webserial' | 'webusb' | 'qz' | 'qz-printer' | 'browser' | 'system';
export type WebSerialFlowControl = 'none' | 'hardware';

/**
 * Configuración local de la impresora de una caja/terminal.
 * No se guarda en Firestore porque las direcciones y permisos pertenecen al dispositivo.
 */
export interface PrinterConfiguration {
  enabled: boolean;
  autoPrintAfterInvoice: boolean;
  format: InvoicePrintFormat;
  transport: PrinterTransport;
  printerName?: string;
  bluetoothAddress?: string;
  usbVendorId?: number;
  usbProductId?: number;
  networkHost?: string;
  networkPort: number;
  webSerialBaudRate?: number;
  webSerialFlowControl?: WebSerialFlowControl;
  webSerialUsbVendorId?: number;
  webSerialUsbProductId?: number;
  webSerialBluetoothServiceClassId?: string;
  qzSerialPort?: string;
  qzPrinterName?: string;
  webUsbVendorId?: number;
  webUsbProductId?: number;
  webUsbSerialNumber?: string;
  copies: number;
  cutPaper: boolean;
}

export const DEFAULT_PRINTER_CONFIGURATION: PrinterConfiguration = {
  enabled: true,
  autoPrintAfterInvoice: false,
  format: 'ticket58',
  transport: 'bluetooth',
  networkPort: 9100,
  webSerialBaudRate: 9600,
  webSerialFlowControl: 'none',
  copies: 1,
  // La 2C-P58-C normalmente utiliza sierra manual.
  cutPaper: false,
};
