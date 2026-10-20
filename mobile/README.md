# ServiMatch móvil — SCRUM-10 a SCRUM-12

## SCRUM-55: calificar un servicio

En una solicitud COMPLETADA, el cliente elige de 1 a 5 estrellas y puede escribir
un comentario público de hasta 1000 caracteres. Enviar calificación guarda una
única opinión; el trabajador puede consultar la calificación de su servicio.
El detalle de un servicio muestra promedio, cantidad y opiniones públicas del
trabajador, sin identificar a los clientes ni sus solicitudes. Se actualiza al
volver a la pantalla y permite cargar más opiniones.

Requiere la API actualizada y `20261013220000_service_reviews.sql`. Las opiniones
permanecen después del servicio; únicamente el chat es temporal.
Pruebas: `npm run test:reviews`. Comprobar con cliente y trabajador: finalizar
con código, calificar, reabrir y comprobar que no se puede repetir ni modificar;
visitar el detalle y comprobar el promedio. Una solicitud no completada no debe
permitir calificar, y otra cuenta no debe acceder a la reseña privada.

## Seguimiento y chat temporal (SCRUM-53 y SCRUM-56)

El seguimiento usa tarjeta del participante, cinco pasos horizontales y barra
de avance. Conserva los estados reales de pago, en camino y listo para retirar;
los detalles de dirección, precio e identificador completo son desplegables.
Para el cliente, la tarjeta obtiene el nombre del trabajador desde el servicio
asociado a la solicitud y verifica su identidad; no depende de la consulta del
chat. Si el servicio ya no está disponible, muestra el error y permite reintentar.
Ir al chat abre una conversación privada de la solicitud. Permite enviar,
editar y eliminar mensajes propios; los mensajes se actualizan cada 3 segundos
mientras la pantalla está activa. Se pausa en segundo plano o con la pestaña
oculta y se actualiza al volver. No se superponen consultas durante un envío
ni se conservan mensajes en la pantalla al cerrar el chat.
Al terminar, cancelar o rechazar el servicio se eliminan también en la base.

Requiere `20261013210000_temporary_service_chat.sql` y la API actualizada.
Pruebas: `npm run test:chat`. Verificar en dos teléfonos: enviar y recibir,
editar y eliminar mensaje propio, cerrar el servicio y comprobar que el chat
queda cerrado y vacío. Otra cuenta no debe poder consultar la conversación.

Vista visual aislada, con cuentas ficticias y sin Supabase: ejecutar
`node tests/tracking-preview-api.mjs`; en otra terminal iniciar Expo en puerto
8095 con `EXPO_PUBLIC_API_URL=http://127.0.0.1:8096/api/v1`. Entrar con
`preview@example.test` y cualquier contraseña de 8 caracteres. Detener ambos
procesos al terminar y mantener esta URL fuera de la configuración habitual.

Próximas citas muestra nombre del cliente y comuna de atención. Agendar a domicilio
exige seleccionar la comuna correspondiente a la dirección ingresada. En taller,
el cliente ve la comuna definida por el trabajador, sin selector ni dato enviado.
Publicar/editar un taller exige comuna_taller_id. Los talleres antiguos requieren
completarla antes de permitir nuevas reservas. La migración adicional es
`20261010160000_worker_owned_workshop_commune.sql`; conserva las citas existentes.
No usa la comuna del perfil cliente. Las citas antiguas muestran Comuna por
confirmar. Requiere aplicar `20261010120000_booking_client_and_service_commune.sql`
y actualizar el backend. Probar domicilio fuera de la comuna del perfil,
taller, búsqueda de comuna, cancelación del selector y citas antiguas.

Login conectado a `POST /api/v1/auth/login` y `GET /api/v1/auth/me`.
Después de ingresar se muestra el nombre, correo y rol del perfil real.
En Android e iOS, la sesión se almacena cifrada con Expo SecureStore y se restaura
al reiniciar la app. Si el access token venció, el móvil utiliza `/auth/refresh`,
guarda los tokens rotados y vuelve a consultar `/auth/me`. Nunca se guarda la
contraseña. En web, la sesión se conserva solo durante la pestaña actual mediante
`sessionStorage`, porque el navegador no ofrece un equivalente de SecureStore.
Cerrar sesión elimina los tokens y el perfil local; todavía no existe revocación
remota de sesiones en el backend.
Mientras la app permanece abierta, la sesión se renueva antes de vencer. Si una
petición protegida recibe 401, se intenta una renovación y se reintenta una vez.
Mientras se comprueba la sesión guardada, la navegación muestra una pantalla de
carga. Login y Perfil se montan únicamente después de conocer el estado real, por
lo que recargar la app no debe mostrar brevemente el formulario de ingreso.
Desde Login, **Crear cuenta** abre Registro con selección obligatoria de Cliente
o Trabajador, nombre, correo, RUT, contraseña y confirmación. Se valida el dígito
verificador del RUT antes de enviar `POST /api/v1/auth/register`. Al aceptar el
registro se limpian los campos y se indica si hace falta confirmar el correo.
El trabajador indica dirección base y comuna en ese formulario. Si debe confirmar el
correo, ve una vista intermedia y después inicia sesión. Si recibe una sesión
al registrarse, continúa directamente al paso documental. La cuenta y su
ubicación se crean juntas, pero eso no implica aprobación para trabajar.

En **Mi perfil**, el cliente puede editar nombre, teléfono, dirección y comuna
sin salir de la pantalla. El RUT y el correo se muestran como datos no editables.
Si su cuenta es anterior a la creación automática de perfiles, se le pide
completar dirección y comuna allí mismo. La desactivación de cuenta requiere una
confirmación y después cierra la sesión local.

Antes de Home, el trabajador sin documentos o con verificación rechazada ve una
pantalla dedicada para subir frente y reverso del carnet más una selfie. Esa
pantalla no permite editar la dirección ni la comuna. Las imágenes deben ser JPEG, PNG o WebP
de hasta 5 MiB cada una. Una vez enviadas, entra al Home limitado con estado
`PENDIENTE` y puede editar dirección y comuna desde **Mi perfil**. Si vuelve a ser
rechazado, regresa al paso documental con el motivo. Con `APROBADA` entra al
Home aprobado. Puede publicar servicios desde el formulario descrito abajo;
la aceptación de trabajos todavía está pendiente. La revisión
se realiza manualmente en Supabase; no hay controles de administrador en la app.
Las cuentas antiguas sin comuna vuelven a **Mi perfil** para elegirla antes de
entrar al paso documental; la app no deduce la comuna del texto de la dirección.

## Publicar servicio — SCRUM-40

Desde el Inicio del trabajador, **Publicar servicio** abre un formulario con
categoría, nombre (3–120 caracteres), descripción (10–1000 caracteres), precio
base en CLP enteros, duración estimada en minutos enteros y modalidad (domicilio
o taller), ubicación pública seleccionada en el mapa y cobertura de 1–100 km
para domicilio. El texto de dirección no se geocodifica: se confirma un punto.
Las categorías se consultan en `/categorias` y la publicación se envía
a `POST /trabajador/servicios` con el token de la sesión actual.

El botón requiere identidad aprobada, carga correcta de los servicios y menos de
cinco publicaciones activas. El formulario vuelve a comprobar esas condiciones;
la base de datos también las aplica al guardar, incluso ante cambios concurrentes.
Después de publicar, se vuelve al Inicio, se muestra una confirmación y se recargan
los servicios y el contador. Los errores conservan los campos para corregirlos o
reintentar. Editar y desactivar servicios todavía no tiene interfaz en la app.

Las categorías que requieren certificación exigen una aprobación administrativa
para esa categoría antes de publicar. Los documentos pendientes o rechazados no
habilitan publicaciones; las categorías sin ese requisito mantienen su flujo habitual.

Verificación automatizada: `npm run typecheck` y `npm run test:services`.
En un dispositivo, probar ambos tipos de modalidad, campos inválidos, identidad
pendiente, cinco servicios activos, pérdida de conexión y retorno al Inicio tras
publicar. Esta última comprobación crea un servicio real; usar una cuenta de prueba.

## Buscar y consultar servicios — SCRUM-39

La pestaña **Buscar** permite consultar el catálogo por texto (nombre o descripción),
categoría, modalidad y precio base mínimo/máximo en CLP. Los filtros se aplican
con **Buscar** o **Aplicar filtros**; **Limpiar** vuelve al catálogo completo.
Se cargan 20 resultados por página y **Cargar más** agrega la siguiente página.
Las búsquedas abandonadas se cancelan para evitar que respuestas antiguas
reemplacen resultados nuevos. Hay mensajes para errores y búsquedas sin resultados.

Desde Inicio, una categoría abre Buscar con ese filtro y un servicio destacado
abre su detalle. El detalle también se abre desde los resultados e incluye
descripción, categoría, precio base, duración estimada, modalidad, trabajador y
comuna. Volver desde el detalle conserva los filtros y resultados de búsqueda.
El detalle se vuelve a consultar al abrirse; si el servicio se desactivó, muestra
que ya no está disponible. Se utiliza la API de catálogo existente, sin nuevas tablas.

Todavía no hay contratación, disponibilidad, distancia ni calificaciones.
Los documentos de certificación son privados y solo una aprobación administrativa
habilita publicar en las categorías correspondientes.

## Certificaciones del trabajador

**Subir certificaciones** en Inicio abre la selección de categorías que requieren
certificación. Se indica el nombre del certificado o licencia y se adjunta un PDF,
JPEG, PNG o WebP de hasta 5 MiB. Se muestra el estado y, en caso de rechazo, el
motivo y un formulario para reenviar un archivo nuevo. No se reemplazan documentos
pendientes o aprobados. **Actualizar estado** vuelve a consultar la revisión.

El formulario de publicación comprueba la aprobación de la categoría y permite
abrir la pantalla de certificaciones desde allí. Al regresar actualiza el estado.
La base de datos también aplica la regla en altas, reactivaciones, cambios de
categoría y ediciones de servicios activos. El catálogo oculta ofertas antiguas
de categorías obligatorias sin certificación aprobada; siguen visibles al propietario.

Requiere aplicar `20261005120000_worker_certifications.sql` tras revisión del equipo.
Antes de aplicarla, la carga muestra que el módulo no está disponible y las
categorías obligatorias permanecen bloqueadas en el formulario.
Pruebas: `npm run test:certifications`. Reiniciar Expo después de instalar la nueva
dependencia `expo-document-picker` con `npm ci`.

Pruebas: `npm run test:catalog`. En dispositivo, comprobar categorías desde Inicio,
detalle desde destacados y resultados, retorno a los filtros, carga de más de 20
resultados, lista vacía, errores de conexión y un servicio desactivado.

## Ejecutar

Desde `mobile`, ejecuta `npm ci` y `npm start`, con Docker funcionando.
Configura `EXPO_PUBLIC_API_URL` en `mobile/.env` según el dispositivo:

- Teléfono: `http://IP_LOCAL_DEL_COMPUTADOR:8000/api/v1`, en la misma red Wi-Fi.
- Emulador Android: `http://10.0.2.2:8000/api/v1`.
- Navegador del computador: `http://localhost:8000/api/v1`.

Reinicia Expo después de cambiar la configuración. La clave secreta de Supabase
pertenece exclusivamente al backend; el Login móvil solo utiliza la URL de la API.

## Verificación

```powershell
npm run typecheck
npm run test:auth
npx expo export --platform android
npx expo export --platform ios
```

En el dispositivo, comprobar:

1. Campos vacíos o correo incorrecto: mensajes junto al formulario.
2. Mostrar/ocultar contraseña y acceso al botón con el teclado abierto.
3. Credenciales incorrectas: error y posibilidad de reintentar.
4. Correo pendiente de confirmación: aviso explícito.
5. Trabajador confirmado: paso documental antes de Home; cliente: su perfil.
6. Cerrar sesión: regreso al Login sin acceso al perfil mediante el botón Atrás.
7. API apagada: error de conexión y botón disponible para reintentar.
8. Registro: no permite enviar sin perfil, con RUT incorrecto o contraseñas diferentes.
9. Registrar una cuenta propia nueva, confirmar el correo e ingresar; verificar
   que el perfil muestra el rol seleccionado. Repetir para el otro rol con datos
   de prueba distintos (el RUT y correo son únicos).
10. En Android o iOS, cerrar y abrir nuevamente la app: debe recuperar el perfil
    sin solicitar otra vez la contraseña.
11. Cerrar sesión y reiniciar la app: debe permanecer en Login.
12. En web, recargar la pestaña mantiene la sesión; cerrar la pestaña elimina la
    sesión temporal.
13. Al recargar con una sesión guardada, debe aparecer brevemente “Preparando tu
    sesión…” y luego la pantalla correspondiente, sin mostrar Login entre ambas.
14. Trabajador pendiente: Home limitado, edición de dirección desde Mi perfil y
    retorno al paso documental si cambia a `RECHAZADA`.

Las pruebas HTTP usan respuestas simuladas; el recorrido real debe comprobarse
con una cuenta propia sin compartir contraseñas ni tokens.
# SCRUM-41: mapa de cobertura del cliente

La pestaña Mapa usa Leaflet 1.9.4 en `react-native-webview` (incluido en Expo Go
SDK 57). Web usa un iframe con sandbox. No se requiere una compilación nativa
personalizada ni claves de Google Maps. `expo-location` permite obtener un punto
una sola vez, únicamente cuando se toca el botón correspondiente. No hay seguimiento
en segundo plano; se puede elegir el punto manualmente sin permisos.

Aplicar las migraciones previas y `20261005180000_service_locations.sql`.
Los servicios nuevos guardan su ubicación desde Publicar servicio y aparecen en
el mapa automáticamente, tanto DOMICILIO como TALLER. Se mantienen aprobación,
cuenta/categoría activa y certificación cuando corresponde. No se copia la
dirección base privada: el trabajador elige información que será pública.
Para ofertas anteriores, ver `supabase/set_service_location.sql`.

La tarjeta del marcador abre el detalle del servicio. Verde indica domicilio,
azul taller y los círculos muestran el radio declarado de domicilio. El cliente
puede filtrar modalidad y elegir su ubicación o usar GPS para ordenar por cercanía,
ver la distancia en línea recta y si entra en el radio de cobertura declarado.
Esa comparación no calcula rutas ni garantiza disponibilidad para contratar.
El punto del cliente se mantiene en memoria en esa pantalla; no se envía al backend.
Se utiliza el proveedor de mapas al visualizar esa zona en el selector.
Hay lista accesible, carga, estado vacío, reintentos y actualización al volver.
Las capas raster vienen de `tile.openstreetmap.org`, con atribución visible,
caché normal y sin precarga ni descarga offline. Uso previsto: pruebas/demostración
de bajo tráfico sujeto a https://operations.osmfoundation.org/policies/tiles/.
Leaflet se descarga del CDN unpkg con versión fija y comprobación de integridad;
se necesita conexión a Internet. Para producción evaluar un proveedor adecuado.

El HTML solo recibe nombres públicos, IDs y coordenadas; nunca tokens. En web el
iframe conserva el origen de la página para enviar el Referer requerido por OSM;
el contenido controlado y Leaflet con integridad comprobada son código de confianza.
El sandbox bloquea formularios, ventanas emergentes y navegación de la página principal.
Los textos
se insertan con `textContent`, el JSON se escapa, se valida el puente de mensajes,
se bloquea navegación y la CSP restringe los recursos. La WebView agrega
`ServiMatch/1.0` al User-Agent y usa el origen Supabase configurado como base URL.

Verificar en Expo Go: publicar un servicio en cada modalidad con su punto;
abrir Mapa, filtrar modalidad, seleccionar marcador y Ver servicio. Usar Mi
ubicación y comprobar distancia/cobertura; denegar permiso y elegir un punto
manualmente. Comprobar también lista, mapa sin conexión y ausencia de ofertas.
La compilación web y las pruebas automatizadas no sustituyen esa prueba en equipo.

Prueba visual aislada (sin Supabase ni registros reales):
`node --experimental-strip-types tests/coverage-preview.mjs`, abrir
`http://127.0.0.1:8093`. Comprobar capas, atribución, selección de ambas modalidades
y la elección manual de un punto;
detener el proceso con Ctrl+C al terminar.

## SCRUM-48: agendar un servicio

Desde el detalle en Inicio, Buscar o Mapa, pulsar **Agendar servicio**. La pantalla
consulta el servicio vigente y sus bloques de disponibilidad. Permite escribir
fecha `DD-MM-AAAA` mediante un calendario y seleccionar hora `HH:MM` en las opciones
generadas desde los bloques publicados, cada 30 minutos. Se muestra la zona horaria del dispositivo; el envío utiliza
un instante UTC con zona horaria, no una fecha sin zona.

La modalidad pertenece a la oferta. DOMICILIO exige una dirección privada de
atención; TALLER muestra la dirección pública y no envía una dirección del cliente.
El formulario verifica futuro, duración completa dentro de un bloque y longitud
de la dirección. El backend vuelve a comprobar disponibilidad, permisos y
duplicados. Los bloques publicados no garantizan que todos sus minutos estén
libres: ante un conflicto se informa al cliente y puede actualizar los horarios.
Una solicitud creada queda PENDIENTE; no representa aceptación ni realiza un pago.

Requiere las migraciones de ubicaciones, `20261006210000_create_bookings.sql` y
`20261006220000_booking_operations.sql`. El trabajador necesita publicar bloques
con `POST /api/v1/trabajador/servicios/{id}/disponibilidad`, usando su token y
`inicio_en`/`fin_en` ISO con zona horaria. La lista de solicitudes sigue en su tarea
correspondiente.

Pruebas: `npm run typecheck` y `npm run test:bookings`. Prueba manual en Expo Go:
publicar un bloque futuro para cada modalidad; agendar ambos, comprobar dirección
privada frente a dirección del taller y confirmación PENDIENTE; intentar fecha
pasada, duración que excede el bloque, sin bloques y repetir el mismo horario.
Verificar actualización de sesión, pérdida de conexión y regreso al servicio.

## Agenda del trabajador

La pestaña Agenda permite seleccionar un servicio activo propio, publicar bloques
del mismo día y consultar/eliminar sus bloques futuros. La fecha usa calendario
y campo DD-MM-AAAA. Fecha y horas son locales
al dispositivo y se envían como instantes UTC. El formulario exige inicio futuro,
término posterior e intervalo suficiente para la duración del servicio. No crea
horarios automáticamente. El cliente consulta los mismos bloques al agendar.

La consulta utiliza el endpoint público de disponibilidad: el servicio debe seguir
visible en catálogo (cuenta activa, verificación y certificación correspondientes).
La creación y eliminación usan el token del trabajador, con renovación de sesión.
Eliminar solicita confirmación y muestra el conflicto si hay reservas confirmadas.
Ante pérdida de conexión, actualizar los bloques antes de repetir la operación.

Probar en Expo Go: ingresar como trabajador, abrir Agenda, elegir un servicio y
publicar mañana de 09:00 a 18:00; como cliente abrir el mismo servicio, actualizar
horarios y enviar una solicitud. Comprobar además bloque corto, fecha pasada,
eliminación, servicio sin bloques y error de eliminación con reserva confirmada.

El detalle del cliente muestra presentación del servicio, descripción, trabajador
con identidad verificada y sus primeros bloques publicados; el botón Agendar queda
fijo al pie. Agendar muestra calendario con días habilitados por bloques y duración,
horas seleccionables, modalidad de la oferta, dirección y resumen del precio base.
No muestra reseñas, estadísticas sin datos ni porcentajes de comisión ficticios.
El envío conserva el estado PENDIENTE y no realiza un cobro. Probar navegación de
meses, cambio de fecha que borra la hora, cambio de modalidad por servicio, dirección
en ambas modalidades y pantallas con fuentes grandes.

Inicio del trabajador: cada publicación activa ofrece Editar y Eliminar.
Editar reutiliza el formulario con los datos actuales y guarda con PATCH; no crea
otra publicación ni consume un nuevo cupo. Las ofertas antiguas deben completar
ubicación pública para guardar desde este formulario. Eliminar pide confirmación
y utiliza el DELETE existente, que desactiva la oferta y conserva las solicitudes
y sus instantáneas. La publicación desaparece del catálogo, mapa e inicio, y libera
un cupo. No requiere nuevas migraciones. Probar guardar/cancelar edición, editar
con cinco servicios activos, completar ubicación antigua y cancelar/confirmar
eliminación; comprobar que otro trabajador no pueda modificar la publicación.

SCRUM-49 y SCRUM-50: Solicitudes del cliente y del trabajador muestran listas
paginadas con filtros por estado, actualización al enfocar y botón Actualizar.
El detalle muestra los datos guardados al reservar y un seguimiento por modalidad:
DOMICILIO incluye En camino; TALLER incluye Listo para retirar. Rechazadas y
canceladas muestran su resultado y motivo disponible. No se inventan fechas de
transiciones: solo se muestra la última actualización disponible.
El trabajador acepta/rechaza solicitudes pendientes y realiza las acciones
permitidas por el estado. Ambos participantes pueden cancelar antes del pago
con motivo. Para finalizar, el cliente genera el código y lo entrega al trabajador,
que lo ingresa y pulsa Finalizar servicio. Requiere la migración
`20261013200000_client_confirmation_worker_completion.sql`, aplicada junto con la API
y el móvil actualizados. Los códigos anteriores pendientes quedan vencidos; el
cliente debe generar uno nuevo. Se conservan el vencimiento de 24h y cinco intentos.
Agenda conserva la gestión de disponibilidad y ofrece Ver reservas por fecha
local, con calendario y formato DD-MM-AAAA; incluye aceptadas y posteriores.
No requiere otra migración. ACEPTADA queda pendiente de pago: la app no simula
ni ofrece marcar PAGADA manualmente; depende de la futura integración de pagos.
Probar con dos cuentas: enviar, aceptar/rechazar, volver a la lista, actualizar
el cliente, revisar fecha en Agenda y cancelar con motivo. Comprobar conflictos
de solicitudes superpuestas, filtros vacíos, carga de más páginas, pérdida de
conexión y acceso a solicitudes de terceros. Las pruebas automáticas de estados
y HTTP no reemplazan la revisión en Expo Go con fuentes grandes.

Inicio del trabajador: PRÓXIMAS CITAS muestra las tres reservas futuras más
cercanas, aceptadas o en avance, con fecha local, servicio, modalidad y estado.
Al volver a Inicio se actualiza; cada tarjeta abre el seguimiento y Ver todas
abre Agenda en la vista de reservas. Hay estados de carga, vacío y reintento.
La consulta aplica fecha y estados antes de limitar los resultados; no incluye
pendientes, rechazadas, canceladas ni completadas. No requiere otra migración.

## SCRUM-54: pago simulado

En Solicitudes, abrir una solicitud aceptada como CLIENTE. El seguimiento muestra
tarifa base, comisión del 15 % y total calculados por el servidor. Pulsar
**Simular pago**, revisar el total y confirmar. La solicitud pasa a PAGADA y
muestra el número del comprobante simulado. No se cobra dinero real.
El trabajador puede consultar el mismo desglose y continuar el servicio.
Si la hora de la cita ya pasó, se muestra el motivo y no se ofrece Simular pago.
El cliente puede cancelar esa solicitud y agendar un nuevo horario futuro.

Requiere la migración `20261013120000_simulated_payments.sql` y la API actualizada.
`npm run test:payments` comprueba el contrato HTTP. Verificación manual en Expo Go:

1. Publicar disponibilidad y agendar un servicio futuro de $20.000.
2. Aceptarlo como trabajador; abrirlo como cliente y comprobar total $23.000.
3. Simular pago; actualizar y comprobar que conserva el mismo comprobante.
4. Como trabajador, avanzar; como cliente, generar el código; como trabajador, ingresarlo y finalizar.
5. Repetir en TALLER; comprobar permisos de otra cuenta y reintento tras perder conexión.
# Calificaciones y ganancias (SCRUM-58/59)

La calificación permanece en el seguimiento de una solicitud COMPLETADA: cliente
selecciona 1–5 estrellas, escribe un comentario opcional y envía una única reseña.
El trabajador puede leerla; el promedio se muestra en el detalle del servicio.

La pestaña Ganancias del trabajador y el acceso del inicio abren el resumen mensual
de ganancias simuladas. Incluye selector de mes, gráfico diario desplazable con
barras seleccionables y detalle paginado de 20 movimientos. El total utiliza la tarifa
base de servicios pagados y completados, por fecha de finalización en horario de Chile.
Los servicios pagados aún en curso se muestran por mes agendado y no se suman al total.
No representa saldo disponible ni ejecuta transferencias.

Comprobar mes vacío, cambio de año, volver a la pantalla tras completar un servicio,
actualización manual y error/reintento. `npm run test:earnings` verifica fechas,
formato CLP, sesión, paginación y errores; `npm run test:reviews` cubre la API de reseñas.
## Organización de solicitudes

Solicitudes del trabajador utiliza las mismas pestañas Activas / Historial y filtro
de estado desplegable que el cliente. Ambas listas muestran las solicitudes más
recientes primero, con colores de estado, cita y precio base. El trabajador mantiene
dirección y duración; la agenda sigue ordenada por hora de atención. Requiere la API
actualizada que permite `vista=activas|historial` para ambos participantes.

## Checkout Pro en Expo Go (SCRUM-74)

El seguimiento consulta el modo de pago al backend. Con Mercado Pago activo, el
cliente de una solicitud ACEPTADA ve el desglose y **Pagar con Mercado Pago**.
Se abre el `init_point` oficial HTTPS con `expo-web-browser` (Safari View Controller
en iOS y Custom Tabs en Android, incluido en Expo Go). Web conserva `expo-linking`.
Esto evita delegar inicialmente el enlace universal a la app de Mercado Pago.
No se guarda Access Token/Public Key en el móvil ni se necesita compilar un módulo propio.
Al cerrar el navegador en iOS se solicita conciliación explícita: el cierre nunca
se interpreta como aprobación. Fallos al abrir o un navegador bloqueado muestran
un mensaje de apertura, separado de los errores del pago.

Usar únicamente el comprador y tarjetas de prueba. La página de retorno invita a
regresar manualmente a Expo Go; al recuperar foco o pasar a primer plano, la app
consulta y concilia el resultado. También ofrece **Consultar estado del pago**.
Se pausa al salir de la pantalla y no ejecuta polling en segundo plano.
PENDIENTE oculta la opción de pagar nuevamente; RECHAZADO permite reabrir el mismo
checkout; APROBADO actualiza el seguimiento y muestra el comprobante; REVISION
indica contactar al administrador sin volver a pagar.

`MERCADO_PAGO_ENABLED=false` conserva la pantalla de simulación académica previa.
Una solicitud ya vinculada al checkout no puede usar el RPC de simulación para saltarlo.
Ejecutar `npm run test:mercadopago` y `npm run typecheck`.
La API de vista previa admite `PREVIEW_MERCADOPAGO=true`; sus datos y endpoints `/qa/*`
son ficticios, no forman parte del backend de ServiMatch ni escriben en Supabase.
