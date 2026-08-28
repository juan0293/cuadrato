# Cuadrato Single-Tenant

Aplicación interna para centralizar la operación de un estudio de tatuajes: agenda, inventario, finanzas, facturación y trabajo móvil del artista.

Este repositorio contiene la edición single-tenant de Cuadrato, actualmente configurada como **Vargas TattooApp**.

## Funcionalidades

- Autenticación y autorización por roles con Firebase.
- Agenda de citas, clientes y disponibilidad de artistas.
- Inventario, compras, proveedores, movimientos y alertas de stock.
- Finanzas con ingresos, gastos, cuentas por pagar y panel de indicadores.
- Facturación con generación de PDF y registro financiero.
- Experiencia móvil para artistas.
- PWA instalable y aplicaciones nativas mediante Capacitor.
- Cloud Functions para administrar usuarios de forma segura.

## Tecnologías

- Angular 20, Ionic 8 y TypeScript 5.9.
- Capacitor 8 para Android e iOS.
- Firebase Authentication, Firestore, Storage, Hosting y Cloud Functions.
- FullCalendar, Chart.js, pdfMake, date-fns y SheetJS.

## Requisitos

- Node.js 20 o superior. Cloud Functions se ejecuta con Node.js 20.
- npm 10 o superior.
- Ionic CLI, opcional para usar `ionic serve`.
- Un proyecto de Firebase para autenticación, base de datos, almacenamiento y despliegue.
- Android Studio o Xcode si se compilarán las aplicaciones nativas.

## Instalación local

1. Clona el repositorio e instala las dependencias:

   ```bash
   git clone https://github.com/juan0293/cuadrato.git
   cd cuadrato
   npm ci
   npm --prefix functions ci
   ```

2. Crea los archivos locales de Firebase a partir de las plantillas:

   ```bash
   cp src/environments/firebase.config.example.ts src/environments/firebase.config.ts
   cp .firebaserc.example .firebaserc
   ```

3. Completa `src/environments/firebase.config.ts` con la configuración de la aplicación web de Firebase y reemplaza `YOUR_FIREBASE_PROJECT_ID` en `.firebaserc`.

4. Inicia el entorno de desarrollo:

   ```bash
   npm start
   ```

   También puedes ejecutar `ionic serve` si tienes Ionic CLI instalado. La aplicación estará disponible en `http://localhost:4200`.

> Los archivos con credenciales o configuración local están excluidos de Git. No confirmes cuentas de servicio, llaves privadas ni archivos `.env`.

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm start` | Inicia el servidor de desarrollo de Angular. |
| `npm run build` | Genera el build web de producción en `www/`. |
| `npm run build:functions` | Compila las Cloud Functions en `functions/lib/`. |
| `npm run build:deploy` | Compila la aplicación web y las funciones. |
| `npm test` | Ejecuta las pruebas unitarias con Karma/Jasmine. |
| `npm run lint` | Analiza TypeScript y plantillas con ESLint. |
| `npm run deploy:rules` | Publica reglas de Firestore y Storage. |
| `npm run deploy:functions` | Compila y publica Cloud Functions. |
| `npm run deploy:hosting` | Compila y publica Firebase Hosting. |
| `npm run deploy:firebase` | Publica reglas, funciones y hosting. |

## Aplicaciones móviles

Después de generar el frontend, sincroniza los proyectos nativos:

```bash
npm run build
npx cap sync
npx cap open android
# o: npx cap open ios
```

Los directorios `android/` e `ios/` forman parte del código fuente. Sus compilaciones, configuraciones locales y credenciales se mantienen fuera del repositorio mediante `.gitignore`.

## Arquitectura

```text
src/app/
├── core/                  # Guards, modelos y servicios transversales
├── layouts/               # Experiencias administrativa y móvil
├── modules/               # Módulos funcionales cargados bajo demanda
│   ├── agenda/
│   ├── auth/
│   ├── dashboard/
│   ├── facturacion/
│   ├── finanzas/
│   ├── inventario/
│   ├── mobile-artista/
│   ├── perfil/
│   └── usuarios/
└── shared/                # Componentes y recursos compartidos
functions/src/             # Cloud Functions de Firebase
docs/                      # Guías de despliegue y listas de QA
```

Los módulos separan páginas, componentes, servicios, modelos, helpers y utilidades. Los componentes delegan el acceso a Firestore en servicios y mantienen la lógica de dominio fuera de la capa de presentación.

## Roles

- `superadmin` / `admin`: administración completa.
- `assistant` / `asistente`: operación diaria de agenda, inventario y facturación.
- `artist` / `artista`: experiencia móvil, citas y consumo de insumos.

## Datos y seguridad

Las colecciones principales incluyen usuarios, citas, disponibilidad de artistas, inventario, compras, cuentas por pagar, movimientos financieros y facturas. Las reglas se encuentran en `firestore.rules` y `storage.rules`.

Antes de usar datos de ejemplo, revisa `firestore/demo-data.json` y evita cargar información personal o productiva en entornos de desarrollo.

## Documentación adicional

- [Despliegue en Firebase](docs/FIREBASE_DEPLOY.md)
- [Checklist general de QA](docs/QA_CHECKLIST.md)
- [Checklist de inventario fiscal](docs/QA_INVENTARIO_FISCAL_CHECKLIST.md)
- [Estado del inventario fiscal](docs/INVENTARIO_FISCAL_READY.md)

## Estado del proyecto

El MVP incluye autenticación, usuarios y roles, agenda, inventario, finanzas, facturación, aplicación móvil para artistas y documentación de QA. No incluye reservas públicas, pasarela de pago, nómina avanzada, marketplace ni arquitectura SaaS multiempresa.

## Licencia

Software privado. No se concede permiso de uso, copia, modificación o distribución sin autorización del propietario.
