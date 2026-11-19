# Revisión del cierre Wej65Iwv7q5v9CtR6QZh

Proyecto: `cuadroto-sigle-tenant`. Fuente: lectura de `turnosCaja/Wej65Iwv7q5v9CtR6QZh` y sus 17 facturas emitidas. El usuario confirmó que el fondo inicial se cuenta aparte. Esta revisión no modifica documentos históricos de producción.

| Concepto | Guardado en el cierre | Recalculado desde facturas |
| --- | ---: | ---: |
| Ventas facturadas | RD$3,880 | RD$3,880 |
| Efectivo aplicado a ventas | RD$1,885 | RD$1,970 |
| Tarjeta | RD$0 | RD$0 |
| Transferencias | RD$1,310 | RD$1,310 |
| Ventas a crédito | RD$600 | RD$600 |
| Fondo inicial | RD$2,000 | RD$2,000, contado aparte |
| Efectivo esperado para el conteo | RD$3,885 | RD$1,970 |
| Efectivo contado | RD$1,895 | RD$1,895, conservando el conteo registrado |
| Diferencia de efectivo | −RD$1,990 | −RD$75 |

## Causas

1. El cierre sumó el fondo inicial al efectivo esperado. Como ese fondo se cuenta aparte, no debe exigirse dentro del conteo de ventas.
2. Las facturas VT-001221, VT-001230, VT-001236 y VT-001232 registran devueltas de RD$5, RD$50, RD$5 y RD$25: RD$85 en total. Sus `pagos.efectivo` ya contienen los montos netos aplicados a la venta. El cierre volvió a descontar esos RD$85.
3. Transferencias y crédito ya estaban separados del efectivo. Sus RD$1,910 no constituyen efectivo faltante. La distribución corregida concilia: RD$1,970 + RD$1,310 + RD$600 = RD$3,880.

Con el conteo registrado de RD$1,895 todavía hay RD$75 por conciliar respecto a los RD$1,970 de ventas en efectivo. No se puede dar por conciliado ese importe sin revisar el conteo, una salida de caja documentada u otra justificación. La falta de la moneda de RD$10 en el formulario se corrigió; no permite deducir cuántas monedas había realmente en este cierre.

## Cambios para los próximos cierres

- Se incluye la denominación RD$10.
- Por defecto se cuenta solo el efectivo de las ventas; el fondo se maneja aparte. Hay una opción explícita para incluirlo cuando se cuente conjuntamente, y la elección se persiste en el cierre.
- Los montos aplicados a una factura no vuelven a descontar la devuelta. Se mantiene compatibilidad con facturas antiguas que guardaban el efectivo bruto y un exceso verificable.
- Las devoluciones de pagos mixtos reducen exclusivamente el efectivo. Los comprobantes de tarjeta y transferencia conservan su importe.
- Una factura totalmente a crédito registra cero dinero cobrado.
- La impresión y Finanzas distinguen el fondo separado del incluido; los cierres históricos conservan su fotografía original.
