# Deploy Firebase

## Archivos a actualizar con las nuevas credenciales

- `src/environments/firebase.config.ts`
- `.firebaserc`

## Web app credentials

1. Copiar `src/environments/firebase.config.example.ts` a `src/environments/firebase.config.ts` si vas a cambiar de proyecto.
2. Reemplazar todos los valores por la configuración Web App del nuevo proyecto Firebase.

## Firebase CLI credentials

### Opción 1: sesión interactiva

1. Ejecutar `npm run firebase:login`
2. Ejecutar `cp .firebaserc.example .firebaserc`
3. Reemplazar `YOUR_FIREBASE_PROJECT_ID` por el `projectId` real
4. Ejecutar `npm run firebase:use -- YOUR_FIREBASE_PROJECT_ID`

### Opción 2: service account

1. Crear una cuenta de servicio con permisos sobre Hosting, Cloud Functions, Firestore y Storage
2. Guardar el JSON localmente
3. Exportar `GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/service-account.json`
4. Copiar `.firebaserc.example` a `.firebaserc`
5. Reemplazar `YOUR_FIREBASE_PROJECT_ID` por el `projectId` real

## Comandos disponibles

- Reglas: `npm run deploy:rules`
- Functions: `npm run deploy:functions`
- Hosting: `npm run deploy:hosting`
- Todo: `npm run deploy:firebase`

## Qué hace cada deploy

- `deploy:rules` publica `firestore.rules` y `storage.rules`
- `deploy:functions` compila `functions` antes de publicar
- `deploy:hosting` ejecuta `build:pwa` antes de publicar `www`
- `deploy:firebase` compila frontend y functions, luego publica reglas, functions y hosting
