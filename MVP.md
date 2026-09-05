# MVP - ServiMatch

> Alcance acordado para la primera versión funcional del proyecto.
> Fecha de definición: septiembre de 2026.

---

## 1. Objetivo del MVP

Construir una aplicación móvil que permita completar el ciclo principal de
ServiMatch: un cliente encuentra un servicio, envía una solicitud, el trabajador
la acepta y ejecuta, el cliente paga en modo de pruebas, confirma la finalización
y posteriormente califica al trabajador.

El MVP debe demostrar la viabilidad técnica y funcional del proyecto de título.
No pretende cubrir todavía todas las funciones de una plataforma en producción.

---

## 2. Usuarios incluidos

### Cliente

- Registrarse e iniciar sesión.
- Completar y editar su perfil.
- Buscar y consultar servicios.
- Revisar la disponibilidad de un servicio.
- Crear y cancelar solicitudes.
- Pagar mediante Mercado Pago Sandbox.
- Consultar el estado y el historial de sus solicitudes.
- Confirmar la finalización del servicio mediante un código.
- Calificar y escribir una reseña.

### Trabajador

- Registrarse e iniciar sesión con rol de trabajador.
- Completar su perfil y enviar antecedentes de identidad.
- Consultar el estado de su verificación.
- Crear, editar, activar y desactivar hasta cinco servicios.
- Definir precio, duración estimada, modalidad y disponibilidad.
- Aceptar o rechazar solicitudes.
- Actualizar el estado de una solicitud según su modalidad.
- Consultar su historial de trabajos.
- Generar o consultar el código utilizado para confirmar la finalización.

### Administrador

El MVP no tendrá inicialmente una aplicación administrativa independiente. Las
acciones administrativas se realizarán mediante Supabase Dashboard y endpoints
protegidos cuando sean necesarios.

- Aprobar o rechazar verificaciones de trabajadores.
- Administrar las categorías iniciales.
- Consultar usuarios, servicios y solicitudes.

---

## 3. Funcionalidades incluidas

### Módulo 1: autenticación y perfiles

- Registro mediante correo y contraseña con Supabase Auth.
- Inicio y cierre de sesión.
- Recuperación básica de contraseña mediante Supabase.
- Selección de un único rol al registrarse: `CLIENTE` o `TRABAJADOR`.
- Perfil asociado a `auth.users` mediante UUID.
- Persistencia segura de la sesión en el dispositivo.
- Validación del JWT de Supabase en FastAPI.

### Módulo 2: trabajadores y verificación

- Registro de RUT, dirección base y datos del trabajador.
- Carga de imágenes del documento de identidad en Supabase Storage.
- Estados de verificación: `PENDIENTE`, `APROBADA` y `RECHAZADA`.
- Un trabajador solo puede publicar servicios después de ser aprobado.
- La validación será manual para el MVP.

### Módulo 3: categorías y servicios

- Catálogo inicial de categorías cargado mediante datos semilla.
- Creación, consulta, edición y desactivación de servicios.
- Cada servicio tendrá categoría, nombre, descripción, precio base, duración
  estimada y modalidad.
- Modalidades soportadas: a domicilio o en taller.
- Máximo de cinco servicios activos por trabajador.
- Precios almacenados y mostrados en pesos chilenos.

### Módulo 4: disponibilidad y búsqueda

- El trabajador define bloques de disponibilidad para cada servicio.
- El cliente busca por texto y categoría.
- Filtros mínimos: modalidad y rango de precio.
- Visualización del detalle, trabajador, precio, disponibilidad y calificación.
- Prevención de solicitudes que produzcan conflictos de horario.

### Módulo 5: solicitudes

- Creación de una solicitud con servicio, fecha, hora y modalidad.
- Dirección del cliente obligatoria para servicios a domicilio.
- Aceptación o rechazo por parte del trabajador.
- Cancelación básica y registro del motivo.
- Historial para cliente y trabajador.
- Transiciones de estado validadas por el backend.

Flujo a domicilio:

```text
PENDIENTE -> ACEPTADA -> PAGADA -> EN_CAMINO -> EN_CURSO -> COMPLETADA
```

Flujo en taller:

```text
PENDIENTE -> ACEPTADA -> PAGADA -> EN_CURSO -> LISTO -> COMPLETADA
```

Los estados `RECHAZADA` y `CANCELADA` serán estados terminales alternativos.

### Módulo 6: pagos y confirmación

- Creación de pagos exclusivamente con Mercado Pago Sandbox.
- Comisión de plataforma del 15 % sobre la tarifa base.
- Registro de tarifa base, comisión, total y estado del pago.
- Actualización segura del resultado mediante webhook o validación desde el
  backend; el resultado informado por el teléfono no será suficiente.
- Generación de un código de confirmación con expiración de 24 horas.
- Finalización del servicio al validar correctamente el código.
- Simulación académica de la liberación del ingreso al trabajador.

### Módulo 7: calificaciones

- Una calificación por solicitud completada.
- Puntuación entera de 1 a 5.
- Reseña de texto opcional.
- Promedio y cantidad de calificaciones visibles en los servicios.

---

## 4. Fuera del alcance del MVP

- Pagos reales o credenciales de producción.
- Transferencias o retiros reales para trabajadores.
- Chat en tiempo real.
- Notificaciones push y correo electrónico.
- Mapa interactivo, geocoding automático y seguimiento GPS.
- Certificaciones profesionales con flujo completo de validación.
- Cambio de rol de cliente a trabajador.
- Penalizaciones monetarias automáticas por cancelación.
- Filtro automático de contenido en reseñas.
- Reportes, disputas y carga de evidencias.
- Tickets de soporte.
- Panel web administrativo propio.
- Aplicación para iOS publicada en App Store o Android publicada en Play Store.
- Internacionalización; la aplicación estará solamente en español.

Estas funciones podrán agregarse después de validar el flujo principal.

---

## 5. Stack tecnológico acordado

### Aplicación móvil

| Área | Tecnología |
|------|------------|
| Base | Expo + React Native + TypeScript |
| Navegación | React Navigation: Native Stack y Bottom Tabs |
| HTTP | Axios |
| Estado remoto y caché | TanStack Query |
| Estado de sesión | React Context |
| Formularios | React Hook Form |
| Validación local | Zod |
| Pruebas | Jest + React Native Testing Library |

### Backend

| Área | Tecnología |
|------|------------|
| API | Python + FastAPI |
| Servidor | Uvicorn |
| Esquemas | Pydantic v2 |
| Cliente HTTP asíncrono | httpx |
| Pruebas | Pytest |
| Calidad | Ruff |

### Servicios externos

| Área | Tecnología |
|------|------------|
| Base de datos | Supabase PostgreSQL |
| Autenticación | Supabase Auth |
| Archivos | Supabase Storage |
| Pagos | Mercado Pago Sandbox |

El móvil se autenticará directamente con Supabase Auth. Para las operaciones del
negocio enviará el access token a FastAPI mediante `Authorization: Bearer <token>`.
FastAPI validará el token y será la única vía normal para modificar datos del
dominio. No se expondrá la clave secreta de Supabase en la aplicación móvil.

---

## 6. Criterios de aceptación generales

El MVP se considerará terminado cuando:

1. Un cliente y un trabajador puedan registrarse e iniciar sesión.
2. Un administrador pueda aprobar manualmente al trabajador.
3. El trabajador aprobado pueda publicar un servicio y disponibilidad.
4. El cliente pueda encontrar el servicio y enviar una solicitud válida.
5. El trabajador pueda aceptar la solicitud.
6. El cliente pueda completar un pago de prueba en Mercado Pago Sandbox.
7. Ambos usuarios puedan consultar el estado actualizado de la solicitud.
8. El flujo de domicilio y el flujo de taller respeten sus estados permitidos.
9. El código permita completar el servicio y no funcione después de expirar.
10. El cliente pueda calificar una única vez el servicio completado.
11. Las operaciones protegidas rechacen usuarios sin sesión o con rol incorrecto.
12. Las pruebas automáticas cubran las reglas críticas del backend.

---

## 7. Orden de implementación

### Etapa 0: base del proyecto

- Crear `mobile`, `backend` y `supabase`.
- Configurar Docker Compose para ejecutar el backend de forma reproducible.
- Documentar el entorno y flujo de trabajo compartido del equipo.
- Configurar variables de entorno de ejemplo.
- Configurar formato, análisis estático y pruebas.
- Crear una pantalla móvil y un endpoint de salud para comprobar el entorno.

### Etapa 1: autenticación y perfiles

- Crear esquema inicial de usuarios y perfiles.
- Implementar Supabase Auth en Expo.
- Validar JWT en FastAPI.
- Completar y consultar perfiles.

### Etapa 2: trabajadores, categorías y servicios

- Implementar verificación manual.
- Crear categorías semilla.
- Implementar servicios y límite de cinco activos.

### Etapa 3: disponibilidad, búsqueda y solicitudes

- Publicar bloques de disponibilidad.
- Implementar búsqueda y filtros.
- Crear solicitudes y validar conflictos.

### Etapa 4: estados, pago y confirmación

- Implementar las máquinas de estado de domicilio y taller.
- Integrar Mercado Pago Sandbox.
- Implementar código de confirmación y finalización.

### Etapa 5: calificaciones y cierre

- Implementar reseñas y promedio.
- Agregar pruebas de los recorridos completos.
- Corregir experiencia de usuario, errores y accesibilidad básica.
- Preparar demostración y documentación de ejecución.

---

## 8. Entregable técnico inmediato

El primer incremento programable será:

```text
Aplicación Expo -> Supabase Auth -> JWT -> FastAPI -> perfil en PostgreSQL
```

Antes de este incremento se debe crear el esquema SQL inicial y configurar un
proyecto de Supabase para desarrollo.
