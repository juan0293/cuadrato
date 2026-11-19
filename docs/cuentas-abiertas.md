# Cuentas abiertas en el punto de venta

En Facturación, **Gestionar cuentas** permite abrir una cuenta con un cliente existente o solamente un nombre. No registra un cliente nuevo. **Abrir / Agregar consumos** y **Enviar al carrito / Cobrar** cargan la misma cuenta en el carrito existente. Allí se usan las cantidades, precios, impuestos y descuentos del POS.

Los cambios se guardan automáticamente. **Guardar y salir de la cuenta** conserva la cuenta abierta y libera el carrito. Un carrito ocupado requiere confirmación para guardar sus consumos como otra cuenta antes de cambiar: nunca se mezclan ni sobrescriben productos automáticamente. Una cuenta con una cita debe completar su flujo habitual antes de cambiar; las cuentas abiertas administran consumos de catálogo, sin alterar los abonos de agenda.

**Precuenta** está disponible en la lista y en el carrito. Usa la impresora configurada (58 mm, 80 mm o carta) e identifica el documento como **PRECUENTA — NO VÁLIDA COMO FACTURA**. No crea factura, NCF, ingreso, deuda ni movimiento de inventario.

**Cobrar** utiliza el proceso habitual de pago y emisión. La cuenta se cierra cuando se confirma la transacción de factura; una venta a crédito cierra la cuenta de consumos y crea la cuenta por cobrar correspondiente. El saldo a crédito no se registra como dinero recibido. Un fallo de impresión posterior no reabre la cuenta ni repite la venta.

## Persistencia e inventario

- `cuentasAbiertas/{id}` guarda nombre, cliente opcional, consumos, importes, estado, versión, fechas y responsables.
- `cuentasAbiertas/{id}/eventos` conserva eventos inmutables de apertura, edición, cancelación y facturación.
- Las cancelaciones requieren motivo y confirmación; no hay borrado físico ni reapertura automática de cuentas cerradas.
- Una cuenta abierta no reserva ni descuenta existencias. El POS sigue validando disponibilidad, y la emisión vuelve a validar y descuenta stock dentro de la transacción. La cuenta abierta no aparece en ventas ni cobros del dashboard.
- Los descuentos por línea reducen la base imponible. El descuento global mantiene la regla existente del POS: se resta después de sumar el ITBIS. Esta funcionalidad no cambia el cálculo fiscal actual.
- Para cuentas abiertas, factura, cierre, inventario, ingreso recibido y cuenta por cobrar se guardan en una única transacción. El identificador y la versión de la cuenta quedan en la factura.

## Conflictos, conexión y recuperación

Cada edición exige la versión leída. Dos usuarios pueden consultar una cuenta, pero una edición obsoleta se rechaza. El cobro valida esa versión y el estado abierto; la cuenta se cierra junto con la factura, evitando cobros duplicados incluso desde distintos dispositivos.

Antes de guardar se escribe un respaldo local de los consumos pendientes, separado por usuario. Si hay un error, el cobro permanece bloqueado. Tras recargar se puede usar **Recuperar consumos** en Gestionar cuentas. Si la versión del servidor cambió, se conservan los consumos locales y se exige revisar el estado guardado. La acción de recargar pide confirmación antes de descartar cambios locales. No se realiza mezcla automática de versiones.

Se necesita conexión para crear, confirmar guardados, imprimir desde el estado confirmado y cobrar. El respaldo local protege ediciones pendientes; no convierte la aplicación en un POS con emisión sin conexión. Si el almacenamiento local está bloqueado, la pantalla indica que se debe esperar a ver **Guardada** antes de salir.

## Activación

Es necesario publicar las nuevas reglas de Firestore junto con esta versión de la aplicación:

```sh
npx firebase-tools deploy --only firestore:rules
```

La implementación no modifica roles: las cuentas abiertas están restringidas a administradores y asistentes, como la ruta del punto de venta. No requiere migración de datos ni índices compuestos nuevos. La impresora debe tener su configuración habitual guardada.

## Validación

Las pruebas unitarias cubren el carrito, guardados en serie, respaldo y recuperación, conflictos, salida sin cobro y confirmación al cambiar de cuenta. Las pruebas de impresión cubren los tres tamaños y los transportes existentes.

La integración usa exclusivamente Firestore Emulator en `127.0.0.1:8089`, proyecto `demo-cuadrato-cuentas`, y las reglas del repositorio. Valida persistencia, edición concurrente, cobro simultáneo, stock insuficiente, crédito, cancelación y permisos. Esta suite se omite si el emulador no está iniciado; nunca se conecta a Firebase de producción.

```sh
npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/modules/facturacion/**/*.spec.ts'
```

No se ha efectuado una impresión física ni un cobro de producción como parte de estas verificaciones.
