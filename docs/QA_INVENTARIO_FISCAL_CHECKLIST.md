# QA Checklist - Inventario Fiscal-Ready

## Catálogo
- [ ] Crear producto tipo bien con inventario.
- [ ] Crear servicio sin inventario.
- [ ] Verificar indicador fiscal y tasa ITBIS por item.

## Compras
- [ ] Crear compra borrador con múltiples items.
- [ ] Confirmar compra y validar movimientos `entrada_compra`.
- [ ] Confirmar compra a crédito y validar creación de CxP.

## Cuentas por pagar
- [ ] Ver cuenta en estado `pendiente`.
- [ ] Registrar abono parcial y validar `parcial`.
- [ ] Completar pago y validar `pagada`.

## Decomisos y ajustes
- [ ] Registrar decomiso con motivo.
- [ ] Registrar merma/avería y validar salida de stock.
- [ ] Intentar salida mayor al stock y validar bloqueo.

## e-CF Draft
- [ ] Abrir preview e-CF draft desde compra.
- [ ] Validar líneas y observaciones de validación.
