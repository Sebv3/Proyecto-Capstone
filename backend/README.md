# ServiMatch API

## SCRUM-55: calificaciones

Requiere `20261013220000_service_reviews.sql`, posterior a solicitudes y previa
revisión del equipo antes de aplicarla al Supabase compartido.

- `POST /api/v1/solicitudes/{id}/calificacion`: `{ "puntuacion": 5, "comentario": "Buen trabajo" }`.
  Solo CLIENTE activo dueño de una solicitud COMPLETADA. Puntuación entera de
  1–5 y comentario opcional de hasta 1000 caracteres; vacío se guarda como null.
  Identidades y servicio se toman de la solicitud. Devuelve 201 al crear y 200
  al reintentar exactamente el mismo contenido; cambiar una reseña existente es 409.
- `GET /api/v1/solicitudes/{id}/calificacion`: participantes activos; devuelve
  la calificación o null si todavía no existe. No expone solicitudes ajenas.
- `GET /api/v1/trabajadores/{id}/calificaciones?limit=20&offset=0`: proyección
  pública del trabajador activo y verificado, promedio, cantidad y lista paginada.
  No devuelve nombres ni IDs de clientes, solicitudes, direcciones o documentos.
  Sin opiniones, promedio null y cantidad 0.

Una reseña por solicitud, sin edición o eliminación por las cuentas de la app.
La tabla tiene RLS y las escrituras se realizan mediante RPC. Las reseñas quedan
conservadas después del servicio; la eliminación del chat no las afecta.
No se incluye moderación automática, que está fuera del alcance del MVP.

Pruebas: `pytest tests/test_reviews.py`; el script de integración ejecuta
`tests/reviews_rules.sql` y recorre finalizar → calificar en ambas modalidades,
incluyendo dos envíos concurrentes, autoría y privacidad de la proyección pública.

## SCRUM-53: conversaciones temporales

Aplicar `20261013210000_temporary_service_chat.sql` después de las migraciones
de solicitudes; revisar con el equipo antes de aplicarla al Supabase compartido.
Las tablas `conversaciones` y `mensajes` tienen RLS, una conversación por solicitud
y escritura exclusiva mediante RPC autenticado. Solo los participantes activos
pueden acceder, incluso desde PostgREST directo. No hay historial de versiones.

- `POST /solicitudes/{id}/chat`: abrir o reutilizar la conversación.
- `GET /solicitudes/{id}/chat?limit=50&offset=0`: leer sin crear; devuelve los
  mensajes más recientes en orden cronológico dentro de la página y `has_more`.
- `POST /solicitudes/{id}/chat/mensajes`: `{ "id": "UUID", "contenido": "Texto" }`.
  El UUID permite reintentar un envío sin duplicarlo; el autor viene de la sesión.
- `PATCH /solicitudes/{id}/chat/mensajes/{mensaje_id}`: reemplazar contenido propio.
- `DELETE /solicitudes/{id}/chat/mensajes/{mensaje_id}`: eliminar mensaje propio.

Textos de 1–2000 caracteres. Al pasar a COMPLETADA, CANCELADA o RECHAZADA, un
trigger elimina la conversación y sus mensajes dentro de la transacción del
servicio. El chat cerrado devuelve 410 y no puede reabrirse. Los datos no se
registran en notificaciones ni logs de contenido; las copias de respaldo del
proveedor siguen su propia política de retención.

Validación: `pytest tests/test_chat.py` y el script de integración aislada, que
incluye pruebas SQL de RLS, autoría, paginación, reintentos y eliminación física.

## Finalización autorizada por el cliente

`20261013200000_client_confirmation_worker_completion.sql` invierte los permisos
de los códigos: `POST /solicitudes/{id}/codigo-confirmacion` requiere al cliente
dueño activo; `POST /solicitudes/{id}/completar` requiere al trabajador dueño activo
y `{ "codigo": "012345" }`. Actualizar API y móvil junto con la migración, previa
revisión del equipo. Se permiten EN_CURSO en domicilio y LISTO en taller.
Los códigos pendientes anteriores vencen para que el cliente genere uno nuevo;
se conservan historial, límite de cinco intentos y expiración de 24 horas.
La validación correcta completa la solicitud; la liberación simulada del ingreso
sigue pendiente. El script de integración incluye ambas modalidades y pruebas SQL
de permisos, vencimiento y bloqueo del código.

## SCRUM-54: pagos simulados

Requiere `20261013120000_simulated_payments.sql`, después de las migraciones
de solicitudes y comunas. Revisar con el equipo antes de aplicar al Supabase compartido.

- `GET /api/v1/solicitudes/{id}/pago`: desglose calculado en el servidor y
  comprobante si existe; acceso exclusivo de participantes activos.
- `POST /api/v1/solicitudes/{id}/pago/simular`: cuerpo `{}`, solo CLIENTE dueño.
  Una solicitud ACEPTADA y futura pasa a PAGADA y recibe un pago APROBADO
  en la misma transacción. No acepta montos, identidades ni estados del móvil.

El total es tarifa base de la solicitud + comisión del 15 %. Se usan CLP enteros
y redondeo al peso más cercano, con medio peso hacia arriba: $20.000 + $3.000 =
$23.000; una tarifa de $10 produce $2 de comisión. El ingreso simulado del
trabajador corresponde a la tarifa base. `simulado=true` es obligatorio: no hay
cobros, transferencias ni integración con Mercado Pago en este incremento.

Hay un pago por solicitud. Reintentar devuelve el mismo comprobante y el estado
actual, incluso si el servicio ya avanzó. Pago y cancelación comparten bloqueos:
solo uno puede prosperar; después de pagar se mantiene bloqueada la cancelación
hasta implementar reembolsos. Una solicitud PAGADA antigua sin comprobante no
recibe un pago retroactivo automáticamente.

Pruebas HTTP: `docker compose exec api pytest tests/test_payments.py`.
Pruebas SQL y recorridos completos con PostgreSQL/PostgREST desechables:

```powershell
# Requiere ambas imágenes locales; nunca apunta a Supabase compartido.
docker pull postgres:16-alpine
docker pull public.ecr.aws/supabase/postgrest:v14.5
./backend/scripts/test_sprint4_integration.ps1 -PostgresImage postgres:16-alpine
```

El script incluye las migraciones de comunas, reglas de pagos, pruebas de
concurrencia y finalización de ambas modalidades. Elimina sus contenedores al
terminar. Las fixtures y funciones de pruebas nunca se aplican al entorno compartido.

Las nuevas solicitudes a domicilio requieren `comuna_servicio_id` (comuna activa).
En taller se toma la comuna de la publicación; el cliente puede omitir ese campo
y se rechaza si envía una comuna diferente. La migración
`20261010120000_booking_client_and_service_commune.sql` debe aplicarse junto con
esta versión de la API: guarda nombre del cliente y comuna como instantáneas,
visibles solo a participantes. Citas antiguas conservan comuna null.
Para las pruebas HTTP aisladas, incluir esta migración después de la corrección
de conflictos y antes de ejecutar test_booking_integration.py.

La forma recomendada de ejecutar la API es mediante Docker Compose desde la raíz
del repositorio. La documentación interactiva queda disponible en
`http://localhost:8000/docs` y el endpoint de salud en
`http://localhost:8000/api/v1/health`.

## Certificaciones profesionales

La migración `20261005120000_worker_certifications.sql` crea
`certificaciones_trabajador` y el bucket privado `certificaciones-trabajador`.
Debe revisarse con el equipo antes de aplicarla al Supabase compartido.

- `GET /api/v1/trabajador/certificaciones`: estado de los documentos del trabajador.
- `POST /api/v1/trabajador/certificaciones`: multipart con `categoria_id`, `nombre`
  y `documento` (PDF, JPEG, PNG o WebP de hasta 5 MiB). Envía o reenvía tras rechazo.
- `GET /api/v1/admin/certificaciones`: lista de pendientes con una sesión ADMIN activa.
- `GET /api/v1/admin/certificaciones/{id}/documento`: enlace privado firmado por 60 segundos.
- `PATCH /api/v1/admin/certificaciones/{id}`: `estado` APROBADA o RECHAZADA y
  `motivo_rechazo` obligatorio al rechazar. Se revisa una sola vez cada envío.

El trabajador nunca puede elegir su estado ni el administrador revisor. La revisión
se hace con los endpoints administrativos en `/docs`: autorizar con el token de
un ADMIN activo, listar pendientes, abrir el documento firmado, comprobar que
corresponde al trabajador y al requisito de la categoría, y aprobar o rechazar.
Los endpoints del trabajador no devuelven rutas de archivos ni enlaces públicos.

Publicar, reactivar, cambiar de categoría o editar un servicio activo exige una
certificación aprobada para su categoría cuando esta la requiere, además de
identidad aprobada y un máximo de cinco servicios activos. Desactivar sigue permitido.
El catálogo y sus políticas ocultan ofertas sin la aprobación requerida, incluidas
las anteriores a la migración. No se aprueba ni se desactiva automáticamente ninguna
certificación u oferta preexistente.

Pruebas HTTP: `pytest tests/test_worker_certifications.py tests/test_worker_services.py`.
Las pruebas SQL en `supabase/tests` utilizan un esquema mínimo en PostgreSQL
temporal; no sustituyen la comprobación del recorrido completo en Supabase después
de que el equipo revise y aplique la migración.

## Pruebas

Con el contenedor en ejecución:

```powershell
docker compose exec api pytest
```

## Perfil y verificación del trabajador

El trabajador indica dirección base y comuna durante `POST /api/v1/auth/register`.
La migración `20260925240000_add_worker_commune.sql` agrega `comuna_id` y crea
la fila de `trabajadores` con ambos datos junto con la cuenta. Tras iniciar
sesión puede consultar su ubicación con `GET /api/v1/perfiles/trabajador`;
`PATCH` permite editar dirección y comuna desde «Mi perfil» después de enviar
documentos. Las cuentas anteriores sin comuna deben completarla antes de subir
documentos; el endpoint `POST /api/v1/perfiles/trabajador` sigue disponible para
cuentas antiguas sin fila de trabajador.

Después envía `carnet_frontal`, `carnet_reverso` y `selfie` como
`multipart/form-data` a `POST /api/v1/verificaciones/trabajador`. Se aceptan
JPEG, PNG y WebP de hasta 5 MiB cada uno. Los archivos se guardan en el bucket
privado `documentos-verificacion`, bajo una carpeta del usuario; la API no
devuelve rutas ni enlaces públicos. `GET /api/v1/verificaciones/trabajador`
devuelve `PENDIENTE`, `APROBADA` o `RECHAZADA` y el motivo de rechazo. Solo es
posible reenviar documentos cuando el estado sea `RECHAZADA`. No hay endpoint
para que un trabajador cambie el estado.

La revisión administrativa acordada se hace manualmente en Supabase SQL Editor
con un usuario activo de rol `ADMIN` ya registrado. Primero consulta los
pendientes y las rutas privadas:

```sql
select v.trabajador_id, u.nombre, u.rut, t.direccion_base,
       v.carnet_frontal_path, v.carnet_reverso_path, v.selfie_path, v.estado
from public.verificaciones_trabajador v
join public.trabajadores t on t.usuario_id = v.trabajador_id
join public.usuarios u on u.id = v.trabajador_id
where v.estado = 'PENDIENTE'
order by v.creado_en;
```

Los documentos deben revisarse desde el bucket privado en el Dashboard antes
de actualizar `estado`, `revisado_por` y `revisado_en`; para rechazar se requiere
además `motivo_rechazo`. La base valida que `revisado_por` sea un administrador
activo. No pegar aquí claves de servicio ni publicar el bucket.

Tras revisar los tres archivos, sustituye los UUID por los IDs reales. Para
aprobar:

```sql
update public.verificaciones_trabajador
set estado = 'APROBADA', motivo_rechazo = null,
    revisado_por = 'ADMIN_UUID'::uuid, revisado_en = now()
where trabajador_id = 'TRABAJADOR_UUID'::uuid and estado = 'PENDIENTE'
returning trabajador_id, estado, revisado_en;
```

Para rechazar, usa `estado = 'RECHAZADA'` y un motivo no vacío:

```sql
update public.verificaciones_trabajador
set estado = 'RECHAZADA', motivo_rechazo = 'Documento ilegible',
    revisado_por = 'ADMIN_UUID'::uuid, revisado_en = now()
where trabajador_id = 'TRABAJADOR_UUID'::uuid and estado = 'PENDIENTE'
returning trabajador_id, estado, motivo_rechazo;
```

## Autenticación (SCRUM-9)

La API delega registro, inicio de sesión y renovación de tokens en Supabase Auth.
Supabase crea automáticamente el perfil en `public.usuarios` durante el registro.
La aplicación móvil utilizará estos endpoints:

| Endpoint | Entrada | Respuesta |
|---|---|---|
| `POST /api/v1/auth/register` | `email`, `password`, `nombre`, `rut`, `telefono`, `rol`, `direccion`, `comuna_id` | `user_id`, `session` y `email_confirmation_required` |
| `POST /api/v1/auth/login` | `email`, `password` | `access_token`, `refresh_token`, `token_type`, `expires_in` |
| `POST /api/v1/auth/refresh` | `refresh_token` | Una sesión nueva con tokens renovados |
| `GET /api/v1/auth/me` | `Authorization: Bearer <access_token>` | Perfil del usuario autenticado |

`register` envía `nombre`, `rut`, `telefono` y `rol` como metadatos de Supabase Auth porque la
migración los necesita para crear el perfil. Si está activada la confirmación de
correo, la respuesta de registro tendrá `session: null` hasta que el usuario confirme
su dirección. FastAPI valida el token con Supabase antes de consultar el perfil y
utiliza el token del usuario para respetar las políticas RLS de PostgreSQL.

## Comprobar el registro con Supabase real

1. Abre `http://localhost:8000/docs` con la API funcionando.
2. En `POST /api/v1/auth/register`, selecciona **Try it out** e introduce tu
   correo, una contraseña nueva de al menos ocho caracteres, nombre, RUT válido
   y rol `CLIENTE` o `TRABAJADOR`. Escribe la contraseña solo en tu equipo.
   El RUT admite puntos y se normaliza; un dígito verificador incorrecto devuelve 422.
3. Ejecuta la petición. Un 201 indica que Supabase aceptó el registro. Si devuelve
   `email_confirmation_required: true`, abre el enlace del correo de confirmación.
   No desactives esa comprobación para saltarte este paso.
4. En `POST /api/v1/auth/login`, introduce el mismo correo y contraseña.
   Si falta confirmar el correo, la API responde 403 con un mensaje específico.
5. Copia el `access_token` de la respuesta de login. En **Authorize**, pégalo
   en el campo de HTTPBearer (solo el token, sin escribir `Bearer`).
6. Ejecuta `GET /api/v1/auth/me`. Debe responder 200 con tu perfil y rol.
7. Para comprobar la renovación, utiliza el `refresh_token` de login en
   `POST /api/v1/auth/refresh`. Autoriza de nuevo con el nuevo `access_token`
   y repite `/me`. No compartas los tokens ni capturas que los incluyan.

El endpoint `/health` solo comprueba FastAPI. La consulta autenticada `/auth/me`
comprueba además Supabase Auth, el perfil creado por el trigger y su acceso con RLS.
Un registro real puede enviar correo y crear datos; las pruebas de Pytest usan
respuestas simuladas y no registran usuarios en Supabase.

## Perfil cliente

`GET /api/v1/comunas` entrega el catálogo activo. Con una sesión CLIENTE,
`GET /api/v1/perfiles/cliente` consulta la ficha, `POST` la completa si falta,
`PATCH` modifica nombre, teléfono, dirección y comuna, y `DELETE` desactiva la
cuenta sin borrar su historial. `POST` es principalmente para clientes registrados
antes de que el perfil se creara automáticamente durante el registro.

La migración `20260925210000_update_client_profile_atomically.sql` debe aplicarse
antes de usar el nuevo `PATCH`: concentra los cambios de `usuarios` y `clientes`
en una sola transacción. No modifiques migraciones anteriores ya aplicadas.
# SCRUM-41: locales públicos

`GET /api/v1/locales` lista establecimientos visibles y sus servicios TALLER;
`GET /api/v1/locales/{uuid}` obtiene uno o devuelve 404 si dejó de estar disponible.
Ambos consumen `consultar_locales_catalogo` sin exponer RUT, correo, documentos ni
dirección base privada. El RPC aplica aprobación del trabajador, cuenta activa,
categoría activa y certificación específica. Migración faltante: 503. No hay
endpoints de escritura de locales; el alta se realiza mediante SQL en este sprint.

La pantalla Mapa ahora consume `GET /api/v1/mapa/servicios`, a partir de la
migración `20261005180000_service_locations.sql`. La ubicación pertenece a cada
oferta DOMICILIO o TALLER, con la misma elegibilidad del catálogo. Los endpoints
anteriores de locales siguen disponibles para compatibilidad, pero no alimentan
esta pantalla. La nueva publicación requiere `ubicacion_publica`, `latitud`,
`longitud` y un `radio_cobertura_km` entero de 1–100 para DOMICILIO (null en TALLER).
El PATCH comprueba la ubicación y modalidad efectivas antes de guardar cambios
en esos campos. Las ofertas anteriores pueden desactivarse sin ubicación; no
aparecen en el mapa hasta completar su punto. El catálogo y detalle incluyen
ubicación pública y radio. Nunca se reciben coordenadas del cliente para calcular
proximidad: esa comparación se hace en el móvil.

SCRUM-49/50 reutilizan las operaciones existentes de solicitudes. El listado
`GET /api/v1/solicitudes` permite `estado`, `limit`, `offset`, `desde` (incluido)
y `hasta` (excluido), con fechas ISO que incluyan zona horaria. `agenda=true`
requiere trabajador y limita a ACEPTADA, PAGADA, EN_CAMINO, EN_CURSO, LISTO y
COMPLETADA, siempre filtradas por el participante autenticado y protegidas por RLS.
El móvil convierte el día local a un rango UTC y sigue usando las instantáneas
de precio, dirección y servicio guardadas al reservar. No añade migraciones.
La transición de ACEPTADA a PAGADA continúa reservada al proceso de pago.

`proximas=true` en el listado requiere trabajador y filtra por inicio igual o
posterior a la hora UTC del servidor y estados ACEPTADA/PAGADA/EN_CAMINO/EN_CURSO/
LISTO. Estos filtros se aplican antes de la paginación, ordenada por inicio e ID.
El inicio móvil usa `limit=3`; una fecha `desde` anterior al presente no permite
incluir citas pasadas. No modifica la consulta histórica de Agenda.
