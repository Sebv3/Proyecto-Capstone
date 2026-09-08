# ServiMatch

Aplicación móvil que conecta clientes con trabajadores independientes para
contratar servicios para el hogar. Este repositorio contiene la aplicación Expo,
la API FastAPI y las migraciones de Supabase del proyecto CAPSTONE, sección 004D.

**Integrantes:** Matías Maldonado, Esteban Olivares y Sebastián Almendras.

## Estructura del proyecto

```text
backend/     API FastAPI y pruebas de Python
mobile/      Aplicación móvil Expo, React Native y TypeScript
supabase/    Migraciones SQL y datos semilla
```

## Requisitos

- Git.
- Docker Desktop con Docker Compose.
- Node.js 24.18.0, versión indicada en `.nvmrc`.
- Un teléfono con Expo Go o un emulador Android.
- Acceso al proyecto compartido de Supabase.

No es necesario instalar Python localmente: el backend se ejecuta en Docker.

## Configuración inicial

Abre PowerShell en la raíz del repositorio y crea los archivos de configuración
locales:

```powershell
Copy-Item .env.example .env
Copy-Item mobile/.env.example mobile/.env
```

Completa ambos archivos con las credenciales del entorno de desarrollo. Nunca
subas `.env`, `mobile/.env`, contraseñas ni claves secretas a Git. La clave
`SUPABASE_SECRET_KEY` se utiliza únicamente en el backend; la aplicación móvil
usa la clave publicable.

## Levantar el backend

1. Abre Docker Desktop y espera hasta que muestre **Engine running**.
2. Desde la raíz ejecuta:

```powershell
docker compose up --build --detach
```

Comprueba el resultado en:

- API: <http://localhost:8000/api/v1/health>
- Documentación: <http://localhost:8000/docs>

Para revisar el estado o detener el backend:

```powershell
docker compose ps
docker compose down
```

La primera compilación puede descargar varios cientos de MB. Las imágenes quedan
guardadas en Docker para que los siguientes inicios sean más rápidos.

## Levantar la aplicación móvil

En otra terminal:

```powershell
Set-Location mobile
npm ci
npm start
```

`npm ci` descarga las dependencias declaradas en `package-lock.json` y puede
ocupar varios cientos de MB. Solo es necesario repetirlo cuando cambien las
dependencias o después de clonar el repositorio.

Si se utiliza un teléfono físico, `localhost` no apunta al computador. Define
`EXPO_PUBLIC_API_URL` en `mobile/.env` con la IP local del equipo, por ejemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api/v1
```

Para el emulador Android normalmente se utiliza:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

## Supabase y migraciones

La aplicación utiliza un proyecto remoto compartido de Supabase. Cada cambio de
estructura debe agregarse como una migración nueva dentro de `supabase/migrations`.
No se deben modificar migraciones que ya hayan sido aplicadas.

Para vincular por primera vez el repositorio local:

```powershell
npx supabase login
npx supabase link --project-ref PROJECT_REFERENCE
```

Antes de aplicar una migración remota, revisa qué archivos están pendientes:

```powershell
npx supabase db push --dry-run
```

`npx supabase db push` modifica la base compartida y debe ejecutarse únicamente
después de que el equipo revise y apruebe la migración.

Supabase local es opcional. `npx supabase start` necesita Docker y su primera
ejecución puede descargar alrededor de 9 GB; revisa el espacio disponible antes
de utilizarlo.

## Pruebas y calidad

Con el backend funcionando:

```powershell
docker compose exec api pytest
docker compose exec api ruff check .
```

## Documentación adicional

- [Guía de desarrollo colaborativo](DEVELOPMENT.md)
- [Alcance del MVP](MVP.md)
- [Contexto funcional y técnico](CONTEXT.md)
- [Convenciones de Supabase](supabase/README.md)
- [Documentación del backend](backend/README.md)
