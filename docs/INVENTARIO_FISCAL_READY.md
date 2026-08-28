# Inventario Fiscal-Ready (RD) - Guía Técnica

## Objetivo
Dejar inventario preparado para futura facturación electrónica RD (e-CF) sin emitir XML en esta etapa.

## Alcance implementado
- Productos y servicios en `productosServicios`.
- Compras por factura de proveedor en `compras`.
- Confirmación de compras con entrada automática a stock.
- Cuentas por pagar para compras a crédito en `cuentasPorPagar`.
- Decomisos y ajustes con trazabilidad en `movimientosInventario`.
- Mapper fiscal draft a líneas e-CF (`EcfLineDraft`) sin emisión.

## Colecciones involucradas
- `productosServicios`
- `compras`
- `movimientosInventario`
- `cuentasPorPagar`

## Reglas de negocio críticas
- `tipoItem = servicio` implica `manejaInventario = false`.
- Solo items inventariables impactan stock en compras/decomisos.
- Compra `credito` confirmada crea CxP y enlaza `cuentaPorPagarId`.
- Estados CxP: `pendiente`, `parcial`, `pagada`, `vencida`.
- Mapper e-CF usa indicadores:
  - `indicadorBienServicio`: `1` bien, `2` servicio
  - `indicadorFacturacion`: `0|1|2|3|4`

## Flujo operativo resumido
1. Crear producto/servicio con configuración fiscal.
2. Registrar compra en borrador.
3. Confirmar compra:
   - crea movimientos `entrada_compra`
   - actualiza stock
   - crea CxP si es crédito
4. Gestionar abonos CxP.
5. Registrar decomisos/ajustes por motivo.
6. Previsualizar e-CF draft por compra.

## QA recomendado
- Validar que confirmación de compra no duplique movimientos.
- Validar que servicios nunca alteren stock.
- Validar transición CxP `pendiente -> parcial -> pagada`.
- Validar error `NEGATIVE_STOCK` en salidas que excedan existencia.
- Validar observaciones del e-CF draft para líneas inválidas.
