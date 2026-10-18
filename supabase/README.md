# Supabase - ServiMatch

## SCRUM-55: reseñas de servicios completados

`20261013220000_service_reviews.sql` crea `calificaciones` con puntuación de 1–5,
comentario opcional y una fila por solicitud. `crear_calificacion` verifica cliente
activo, propiedad y estado COMPLETADA; el bloqueo de la solicitud evita duplicados
concurrentes. Reintentar la misma opinión devuelve la fila existente y otra distinta
se rechaza. Las cuentas no tienen permisos de escritura directa ni de edición/borrado.

RLS limita los datos privados a participantes y administradores activos. El RPC
de reputación pública expone solo puntuación, comentario, servicio y fecha, junto
con promedio y cantidad; nunca identidad del cliente o ubicación de la solicitud.
Se conservan las reseñas tras completar el servicio, independientemente del chat.
Revisar con el equipo antes de aplicar al proyecto compartido. Las pruebas SQL
`tests/reviews_rules.sql` se ejecutan solo en la base desechable de integración.

## SCRUM-53: chat temporal

`20261013210000_temporary_service_chat.sql` crea conversaciones únicas por
solicitud y mensajes privados con autoría validada. Solo los participantes
activos pueden leer; la escritura se realiza mediante RPC y los autores pueden
editar o eliminar exclusivamente sus mensajes, sin versiones anteriores.
El trigger de solicitudes elimina conversación y mensajes cuando el servicio
pasa a COMPLETADA, CANCELADA o RECHAZADA, incluso con operaciones concurrentes.
La prueba `tests/temporary_chat_rules.sql` se ejecuta únicamente en la base
desechable del script de integración, nunca en Supabase compartido.

## SCRUM-54: modelo de pago y comisión simulada

`20261013120000_simulated_payments.sql` crea `pagos` con comprobantes privados,
tarifa base, comisión del 15 %, total CLP y marca obligatoria de simulación.
Solo se leen por participantes activos o administradores activos; las cuentas
de la app no pueden insertar, modificar ni eliminar pagos directamente.

`consultar_pago_solicitud` calcula el desglose desde la instantánea de la solicitud.
`simular_pago_solicitud` permite pagar exclusivamente al cliente dueño de una
solicitud ACEPTADA futura. El pago y la transición a PAGADA son atómicos;
reintentos concurrentes reutilizan el comprobante. No hay cobros reales, pasarela
ni creación automática de comprobantes para solicitudes PAGADA preexistentes.

Aplicar después de las migraciones de solicitudes/comunas y previa revisión del
equipo. Para validar en la base desechable, usar el script documentado en
`backend/README.md`: ejecuta `tests/payments_rules.sql` y los recorridos HTTP.
Las pruebas verifican RLS, redondeo, permisos y rollback de un fallo al actualizar
el estado; sus fixtures nunca deben aplicarse al Supabase compartido.

## Notificaciones dentro de la app

`20261011120000_in_app_notifications.sql` crea la tabla privada `notificaciones`,
su lectura limitada al destinatario activo y la función `leer_notificaciones` para
marcar una o todas como leídas sin permitir insertar, eliminar o editar mensajes.
Los triggers generan avisos ante nuevas solicitudes y cambios reales de estado de
solicitudes, verificaciones, certificaciones y solicitudes de rol. También se ejecutan
cuando una revisión autorizada se realiza mediante SQL. El actor de un cambio de
solicitud no recibe un aviso por su propia acción; la contraparte sí. Guardar otra
vez el mismo estado no crea otro aviso. No se generan avisos retroactivos.

La campana consulta los avisos sin leer al entrar y cada 30 segundos mientras la
pantalla está activa. La pantalla muestra 20 avisos por página, permite actualizar,
marcar leídos y abrir la solicitud, certificación o perfil con su revisión. También
hay campana en el formulario de identidad para trabajadores rechazados. Son avisos
dentro de la app compatibles con Expo Go, sin servicios push ni permisos del teléfono.

Prueba en Expo Go: un cliente envía una solicitud nueva; el trabajador vuelve a Inicio
y abre la campana. Al aceptar o rechazar, el cliente recibe el aviso. Marcarlo como leído
debe quitar el punto rojo cuando no queden pendientes. Cancelar debe avisar a la
contraparte. Aprobar/rechazar una revisión con los procedimientos existentes debe
crear un aviso al dueño; abrir una certificación selecciona su categoría. Revisar que
otra cuenta no pueda consultar ni marcar estos avisos. Para probar SQL en una base
vacía y desechable, ejecutar `tests/notifications_rules.sql`; nunca en Supabase remoto.

`20261010160000_worker_owned_workshop_commune.sql` añade comuna_taller_id a las
publicaciones. El trabajador debe completar la comuna al crear/editar un taller;
la base valida la modalidad y comuna activa. El catálogo la expone y crear_solicitud
la toma de la oferta, rechazando una comuna distinta enviada por el cliente.
DOMICILIO conserva la comuna ingresada al agendar. Las ofertas antiguas quedan
sin comuna hasta que el dueño la complete; las solicitudes conservan instantáneas.
Tras las fixtures y migraciones previas de citas/comunas, ejecutar esta migración
y `tests/workshop_commune_rules.sql` solo en la base desechable de pruebas.

## Cliente y comuna de atención en las citas

`20261010120000_booking_client_and_service_commune.sql` agrega instantáneas del
nombre del cliente y de la comuna seleccionada para la dirección del servicio.
La comuna no se obtiene del perfil ni se deduce del texto de la dirección.
Las citas antiguas recuperan el nombre actual del cliente y conservan la comuna
como null (Comuna por confirmar). La firma de crear_solicitud cambia: ahora exige
`p_comuna_servicio_id`; coordinar la migración y actualización de API/móvil.
Aplicar tras la migración de corrección de conflictos del 9 de octubre.
No se modifican permisos de lectura de usuarios/clientes; los datos quedan en
las solicitudes privadas protegidas por sus políticas de participantes.

Prueba en PostgreSQL vacío y desechable: certifications_fixture, certificaciones,
ubicaciones, modelo de solicitudes, operaciones, corrección de conflictos,
booking_http_fixture, nueva migración y `tests/booking_commune_rules.sql`, en ese
orden. Nunca ejecutar fixtures ni tests en Supabase compartido.

Esta carpeta almacenará las migraciones SQL y los datos semilla compartidos por
el equipo. El proyecto remoto de Supabase es el entorno de desarrollo del MVP,
pero su estructura debe poder reconstruirse solamente con los archivos de este
directorio.

## Certificaciones profesionales

`20261005120000_worker_certifications.sql` añade certificados privados por
trabajador y categoría, estados de revisión y aprobación exclusiva de ADMIN activo.
El bucket acepta PDF e imágenes de hasta 5 MiB. Las políticas impiden leer documentos
de otro trabajador, sobrescribir pendientes/aprobados o borrar archivos referenciados.
La publicación y el catálogo exigen aprobación para categorías obligatorias.
Las ofertas antiguas sin certificación quedan ocultas del catálogo, sin modificar
su historial. Revisar su impacto antes de aplicar la migración compartida.

Para una prueba independiente, en una base PostgreSQL 16 **vacía y desechable**,
ejecutar con `psql -v ON_ERROR_STOP=1` estos archivos en orden:

1. `tests/certifications_fixture.sql` (simula Auth/Storage y el esquema previo).
2. `migrations/20261005120000_worker_certifications.sql`.
3. `tests/certifications_rules.sql`.

La fixture y las pruebas **nunca deben ejecutarse en Supabase compartido**.
Comprueban permisos, privacidad, reenvío, revisión administrativa y publicación
por categoría con roles reales de PostgreSQL. La revisión desde la API está
documentada en `backend/README.md`.

## Convenciones

- Cada cambio de esquema se agrega como una nueva migración; no se reescriben
  migraciones que ya hayan sido aplicadas por otros integrantes.
- Las tablas y columnas usan `snake_case`.
- Las claves primarias usan UUID.
- Toda tabla expuesta debe tener Row Level Security habilitado y políticas
  explícitas.
- Los datos iniciales repetibles se guardan en `seed.sql`.
- Nunca se guardan claves o credenciales en esta carpeta.

Las migraciones existentes reconstruyen usuarios, trabajadores, verificación
documental y perfiles cliente. La función `actualizar_perfil_cliente_actual`
guarda los datos personales y de ubicación en una sola transacción. Aplicar una
migración al proyecto remoto compartido requiere revisión del equipo; `seed.sql`
contiene el catálogo inicial de comunas para entornos nuevos.

La migración `20260925220000_lock_worker_verification_submissions.sql` impide
reemplazar documentos mientras una verificación está pendiente o aprobada y
protege los archivos ya referenciados. Aplícala antes de probar la carga de
documentos con trabajadores reales.

La migración `20260925230000_create_worker_profile_during_signup.sql` guarda la
dirección base junto con el registro del trabajador y solo permite editarla
después del primer envío documental. También debe aplicarse al proyecto remoto
antes de probar el nuevo flujo de alta.

La migración `20260925240000_add_worker_commune.sql` incorpora `comuna_id` a
`trabajadores`, valida comunas activas y exige el dato para registros nuevos.
No asigna una comuna arbitraria a los trabajadores existentes. Para revisar
quiénes deben completar el dato:

```sql
select usuario_id, direccion_base
from public.trabajadores
where comuna_id is null;
```

La app los lleva a completar la comuna antes de enviar documentos. Cuando la
consulta anterior no devuelva filas, se puede finalizar la validación con
`alter table public.trabajadores validate constraint trabajadores_comuna_requerida;`.
La restricción `NOT VALID` ya impide nuevos registros o actualizaciones sin
comuna, pero conserva los registros antiguos hasta su corrección.
# SCRUM-41: establecimientos del mapa

`20261005150000_create_coverage_locations.sql` agrega `locales` y el RPC de lectura
`consultar_locales_catalogo`. Requiere las migraciones previas, incluida la de
certificaciones. Revisar con el equipo antes de aplicar al proyecto compartido.
La app nunca recibe la dirección base del trabajador; `direccion_publica` es
información publicada expresamente para el establecimiento.

Para registrar locales ver `register_local.sql`. No agrega locales ficticios a
producción. RLS restringe lectura a locales activos con trabajadores aprobados y
servicios TALLER elegibles; anon/authenticated no tienen permisos de escritura.

Prueba aislada: en PostgreSQL desechable ejecutar `tests/certifications_fixture.sql`,
la migración de certificaciones, la migración de locales y
`tests/coverage_rules.sql`, en ese orden. Nunca ejecutar el fixture en Supabase.

La pantalla de clientes utiliza ahora ubicaciones por servicio:
`20261005180000_service_locations.sql` agrega dirección/sector público, coordenadas
y radio de cobertura a `servicios`. Nuevas publicaciones requieren un punto;
DOMICILIO requiere 1–100 km, TALLER requiere radio null. No se deduce ni publica la
dirección base del trabajador. Los registros existentes mantienen ubicación null,
siguen en búsqueda y pueden desactivarse; para entrar al mapa necesitan completar
el punto con `set_service_location.sql` o el PATCH del trabajador.

`consultar_servicios_mapa` reutiliza la proyección del catálogo y sus reglas de
aprobación y certificación. La tabla `locales` queda disponible, pero no genera los
marcadores del mapa de servicios. Revisar antes de aplicar la migración compartida.

Prueba de ubicaciones: en una base PostgreSQL desechable montada en `/fixtures`,
ejecutar `tests/certifications_fixture.sql`, la migración de certificaciones y
`tests/service_locations_rules.sql`. Este último aplica la migración de ubicación
después de insertar una oferta antigua para comprobar compatibilidad.

## Sprint 4: solicitudes y disponibilidad

`20261006210000_create_bookings.sql` implementa SCRUM-45: instantáneas del servicio,
fecha con zona horaria, modalidad, estados y lectura privada por participantes.
`20261006220000_booking_operations.sql` implementa SCRUM-46 y aplica las
transiciones de SCRUM-47 también en base de datos. Requiere previamente
certificaciones y ubicaciones de servicios. Revisar con el equipo antes de aplicar
al proyecto compartido. SCRUM-48 utiliza estos contratos sin agregar tablas nuevas.

La disponibilidad la publica el trabajador con el endpoint autenticado. No se
crean horarios ficticios en producción. Crear una solicitud exige un bloque que
contenga toda la duración. Aceptar reserva el tiempo del trabajador, incluso entre
ofertas distintas, y rechaza solicitudes pendientes superpuestas. Las operaciones
utilizan bloqueos transaccionales. La transición ACEPTADA → PAGADA está reservada
al proceso de pago y no se puede forzar desde los endpoints de participantes.

Pruebas solo en PostgreSQL desechable: para el modelo usar
`tests/certifications_fixture.sql`, la migración del modelo y
`tests/booking_model_rules.sql`. Para operaciones usar el fixture, migraciones de
certificaciones, ubicaciones, modelo y operaciones, luego
`tests/booking_operations_rules.sql`. Para concurrencia ejecutar
`tests/booking_concurrency_setup.sql`, lanzar los scripts `booking_concurrency_a.sql`
y `booking_concurrency_b.sql` simultáneamente y ejecutar
`booking_concurrency_verify.sql`: una aceptación debe fallar por conflicto y la
otra quedar confirmada. Nunca ejecutar fixtures o estas pruebas en Supabase real.
# Recuperación de contraseña por código

La app solicita el correo, el código numérico y una contraseña nueva con confirmación.
Usa los endpoints `/api/v1/auth/password-recovery` y `/api/v1/auth/password-reset`.
La API llama a Supabase Auth `/recover`, verifica el OTP de tipo `recovery`, actualiza
la contraseña con esa sesión y cierra la sesión de recuperación. No crea usuarios,
no almacena códigos o contraseñas y no requiere migración.

Antes de probar en el proyecto remoto, configurar **Authentication → Email Templates →
Reset Password**: asunto `Código para recuperar tu contraseña de ServiMatch` y cuerpo
del archivo `config-profiles/password-recovery/supabase/templates/recovery.html`.
El correo debe mostrar `{{ .Token }}`; el enlace predeterminado no sirve para este formulario.
El formulario admite códigos numéricos de 6 a 10 dígitos y el largo real lo determina
la configuración de Supabase (actualmente 8 en el proyecto vinculado).

Para desplegar únicamente esta plantilla con una cuenta autorizada:

```powershell
npx --yes supabase config diff --workdir supabase/config-profiles/password-recovery --project-ref lmzjwpapsguyhhdzcofu
npx --yes supabase config push --workdir supabase/config-profiles/password-recovery --project-ref lmzjwpapsguyhhdzcofu --yes
```

El perfil acotado declara solo asunto y contenido de recuperación; no usar el config
principal para este despliegue. El intento desde esta sesión recibió HTTP 403 por
privilegios insuficientes: la plantilla remota sigue pendiente de configurar.

Prueba manual: cerrar sesión → Recuperar contraseña → ingresar correo registrado →
copiar código del correo → escribir y confirmar una contraseña nueva → guardar →
iniciar sesión con ella. Repetir con cliente y trabajador, y probar código incorrecto,
contraseñas diferentes y reenvío tras 60 segundos. Si el envío falla, revisar SMTP,
destinatarios permitidos y límites de envío de Supabase. Si la actualización falla después
de verificar el código, solicitar otro: el código anterior ya fue consumido.

# Ganancias simuladas (SCRUM-59)

La migración `20261016120000_worker_earnings.sql` agrega únicamente una consulta
de lectura `consultar_ganancias_trabajador(date,integer,integer)`. No cambia pagos,
estados ni saldos. Requiere trabajador activo y deriva su identidad de `auth.uid()`.
Se debe revisar y aprobar antes de aplicar a la base compartida.

Calcula resumen mensual y días completos (incluidos los días sin ingresos) en
America/Santiago; el detalle está paginado. Las ganancias corresponden a tarifa base
de pagos simulados aprobados con solicitud COMPLETADA, por fecha de finalización
`actualizado_en` (estado terminal). Los pagos en curso se agrupan por `inicio_en`
y se mantienen aparte. `tests/earnings_rules.sql` verifica aislamiento, roles,
cancelaciones, impagos, límites de mes, año bisiesto y paginación en base desechable.

## Persistencia Mercado Pago de prueba (SCRUM-74)

`20261017220000_mercadopago_test_checkout.sql` agrega:

- `checkout_mercadopago`: una fila por solicitud con snapshot de montos, preferencia,
  vendedor y estado. RLS permite lectura solo a participantes activos.
- `eventos_pago_mercadopago`: auditoría privada por ID de pago; no guarda tarjetas,
  correos ni payloads del proveedor.
- En `pagos`, `proveedor` y `proveedor_pago_id` único. Los registros anteriores
  siguen siendo SIMULADO; los nuevos de sandbox usan MERCADO_PAGO_TEST y simulado=true.

El cliente autenticado solo puede iniciar un checkout para su propia solicitud
ACEPTADA, futura y sin pago. `guardar_preferencia_mercadopago` y
`procesar_pago_mercadopago` son exclusivos de `service_role`. El segundo verifica
monto, moneda, vendedor y entorno, y guarda comprobante + PAGADA de forma atómica.
Comparte orden de bloqueos con las operaciones de agenda y cancelación.
Se bloquea el antiguo RPC de simulación si ya existe un checkout y se revoca
el acceso al helper interno renombrado.

La migración no activa el modo del backend por sí sola. Revisar y aprobar antes
de aplicar al proyecto compartido. Después, activar MERCADO_PAGO_ENABLED y recrear API.
`mercadopago_rules.sql` y los fixtures de rol usados por el runner son exclusivamente
para la base desechable; nunca desplegar los fixtures ni helpers de test al remoto.
