# Desarrollo colaborativo - ServiMatch

Este documento define el entorno común para que todos los integrantes ejecuten
el proyecto de la misma forma.

## 1. Requisitos del equipo

- Git.
- Docker Desktop con Docker Compose v2.
- Node.js 24.18.0, indicado en `.nvmrc`.
- Un teléfono con Expo Go o un emulador Android.
- Acceso al proyecto compartido de Supabase para desarrollo.
- Credenciales de prueba de Mercado Pago cuando se implemente el módulo de pago.

Python no es un requisito local: la API se ejecuta dentro de Docker.

## 2. Configuración inicial

Desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
Copy-Item mobile/.env.example mobile/.env
docker compose up --build
```

En otra terminal:

```powershell
Set-Location mobile
npm install
npm start
```

Cada integrante debe completar sus archivos `.env`. Estos archivos contienen
credenciales y no se suben a Git.

## 3. Qué se ejecuta en Docker

La API FastAPI se ejecuta en el servicio `api`, en el puerto `8000`. El código
de `backend/app` se monta como volumen y Uvicorn recarga los cambios.

La aplicación Expo se ejecuta localmente. Esto permite conectarla con un teléfono
o emulador sin introducir problemas de USB, red y recarga rápida desde Docker.

Supabase se utilizará como proyecto remoto compartido durante el MVP. Los cambios
de base de datos deberán registrarse como migraciones dentro de `supabase/` para
que sean repetibles y revisables. Las claves de servicio nunca deben agregarse al
repositorio ni incluirse en la aplicación móvil.

## 4. Comandos habituales

```powershell
# Levantar o reconstruir la API
docker compose up --build

# Ejecutar las pruebas del backend
docker compose exec api pytest

# Revisar estilo del backend
docker compose exec api ruff check .

# Detener los contenedores
docker compose down
```

## 5. Flujo de trabajo en Git

1. Actualizar la rama principal antes de comenzar.
2. Crear una rama `feature/...`, `fix/...` o `chore/...`.
3. Mantener cada cambio pequeño y enfocado.
4. Agregar o actualizar pruebas cuando cambie una regla de negocio.
5. Abrir una revisión antes de integrar a la rama principal.
6. No subir `.env`, credenciales, archivos generados ni dependencias instaladas.

## 6. Definición de terminado

Un cambio está terminado cuando funciona dentro del entorno documentado, pasa las
pruebas, no contiene secretos, respeta `MVP.md` y su configuración o migración
necesaria queda guardada en Git.
