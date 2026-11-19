import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IonicModule, ActionSheetController, AlertController, LoadingController } from '@ionic/angular';
import { of } from 'rxjs';
import { FacturacionModule } from '../facturacion.module';
import { FacturacionPage } from './facturacion.page';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AgendaService } from '../../agenda/services/agenda.service';
import { ClientesService } from '../../agenda/services/clientes.service';
import { ProductosServiciosService } from '../../inventario/services/productos-servicios.service';
import { FacturacionService } from '../services/facturacion.service';
import { PdfFacturaService } from '../services/pdf-factura.service';
import { CuentasPorCobrarService } from '../services/cuentas-por-cobrar.service';
import { TurnosCajaService } from '../services/turnos-caja.service';
import { InvoicePrintingService } from '../services/invoice-printing.service';
import { PrinterConfigurationService } from '../services/printer-configuration.service';
import { CuentasAbiertasService } from '../services/cuentas-abiertas.service';

describe('Facturación: foco del campo de cantidad en la plantilla real', () => {
  let fixture: ComponentFixture<FacturacionPage>;

  beforeEach(async () => {
    // Aislar la presentación de consultas y plugins; se utiliza la plantilla
    // real para detectar que el ngFor no vuelva a destruir la fila al editar.
    spyOn(FacturacionPage.prototype, 'ngOnInit').and.stub();
    await TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), FacturacionModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { userProfile$: () => of(null) } },
        { provide: PrinterConfigurationService, useValue: { describe: () => 'Impresora de prueba' } },
        ...[ToastService, AgendaService, ClientesService, ProductosServiciosService, FacturacionService,
          PdfFacturaService, CuentasPorCobrarService, TurnosCajaService, InvoicePrintingService,
          CuentasAbiertasService, ActionSheetController, AlertController, LoadingController]
          .map(provide => ({ provide, useValue: {} })),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FacturacionPage);
    fixture.nativeElement.classList.add('ion-page');
    const page = fixture.componentInstance;
    page.loading = false;
    page.tabMobile = 'carrito';
    page.turnoActivo = { id: 'turno', estado: 'abierto', fechaApertura: new Date().toISOString() } as any;
    page.cartItems = [{ key: 'producto-1', descripcion: 'Producto de prueba', cantidad: 1,
      precioUnitario: 100, descuento: 0, subtotal: 100, itbis: 0, total: 100,
      manejaInventario: true, stockActual: 100 }];
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.nativeElement.querySelector('ion-content').componentOnReady();
  });

  afterEach(() => fixture?.destroy());

  it('permite escribir 2 y luego 0 conservando el mismo input y el foco', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cart-quantity-input');
    expect(input).not.toBeNull();
    input.focus();
    expect(document.activeElement).toBe(input);
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cart-quantity-input')).toBe(input);
    expect(document.activeElement).toBe(input);

    input.value += '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cart-quantity-input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('20');
    expect(fixture.componentInstance.cartItems[0].cantidad).toBe(20);
    expect(fixture.componentInstance.total).toBe(2000);
  });

  it('conserva la fila y el precio fijo al recalcular sus descuentos', () => {
    const row: HTMLElement = fixture.nativeElement.querySelector('.cart-item');
    const input: HTMLInputElement = row.querySelector('.cart-quantity-input')!;
    input.focus();
    fixture.componentInstance.updateDiscount(fixture.componentInstance.cartItems[0], 10);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cart-item')).toBe(row);
    expect(document.activeElement).toBe(input);
    expect(row.querySelector('.cart-price-locked')).not.toBeNull();
    expect(fixture.componentInstance.cartItems[0].precioUnitario).toBe(100);
  });
});
