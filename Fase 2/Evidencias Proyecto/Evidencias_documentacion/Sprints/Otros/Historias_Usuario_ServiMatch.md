# Historias de usuario de ServiMatch

ServiMatch permite buscar y contratar servicios, coordinar la atención con un trabajador y calificar el trabajo realizado. Este documento describe las funciones que ofrece la aplicación y las condiciones que debe cumplir cada una.

Las historias mantienen sus identificadores para facilitar su revisión. **Must have** identifica las funciones necesarias para el alcance definido; **Should have**, las que complementan la experiencia.

## Perfiles y acceso

| Usuario | Qué puede hacer |
| --- | --- |
| Cliente | Buscar servicios, enviar solicitudes, pagar en modo de prueba, confirmar la atención y calificar. |
| Trabajador | Presentar antecedentes, publicar servicios habilitados, gestionar su disponibilidad y atender solicitudes. |

Una persona sin sesión puede registrarse, confirmar su correo, iniciar sesión y recuperar el acceso a su cuenta.

La revisión de documentos se realiza manualmente mediante Supabase Dashboard y los accesos autorizados. Esta actividad corresponde a la persona responsable de la revisión y se describe en los procedimientos internos; no existe un panel administrativo propio dentro de la aplicación móvil.

El usuario elige un perfil inicial al registrarse. Para publicar servicios como trabajador necesita la aprobación de su identidad y, cuando la categoría lo exige, de su certificación.

## Alcance de la aplicación

La aplicación requiere iniciar sesión para acceder al catálogo. Las verificaciones se revisan manualmente y los pagos se realizan con Mercado Pago en modo de prueba. El mapa muestra ubicaciones y cobertura de las ofertas, mientras que el chat y las notificaciones permiten coordinar la atención dentro de la aplicación.

El alcance no incluye cobros reales, transferencias al trabajador, custodia real de fondos, seguimiento GPS, notificaciones push, moderación automática de reseñas ni envío de comprobantes por correo o PDF. Los filtros del catálogo se limitan a categoría, modalidad y precio.

Los criterios se numeran dentro de cada historia. Por ejemplo, el primer criterio de US-01 se identifica como **US-01-CA01** cuando se relaciona con una prueba.

## EP-01 Registro, verificación e identidad digital

### US-01 Registro e inicio de sesión

**Prioridad:** Must have.

Como usuario, quiero crear una cuenta e iniciar y cerrar sesión para acceder a las funciones de mi perfil.

**Criterios de aceptación**

1. El registro solicita nombre, correo, RUT, teléfono, contraseña, dirección y comuna, y permite elegir el perfil inicial Cliente o Trabajador.
2. Se validan los datos obligatorios, el RUT y la comuna. Se impide crear una cuenta que incumpla los controles de unicidad.
3. Cuando se requiere confirmar el correo, la aplicación informa ese paso antes de permitir el ingreso.
4. Las credenciales válidas permiten iniciar sesión; las incorrectas muestran un mensaje de error.
5. La sesión se conserva de forma segura y se restaura mientras sea válida. Al cerrarla, se vuelve a la pantalla de acceso.
6. La navegación muestra las funciones y los pasos de incorporación que corresponden al perfil activo.

### US-02 Envío de documentos de identidad

**Prioridad:** Must have.

Como trabajador registrado o cliente que desea habilitar ese perfil, quiero enviar mis documentos para solicitar la revisión de mi identidad.

**Criterios de aceptación**

1. Se permite adjuntar la cédula por ambos lados y una selfie, con los formatos y límites de archivo admitidos.
2. El usuario debe tener completos los datos de dirección y comuna requeridos para su incorporación.
3. Un envío válido queda en estado PENDIENTE y su estado puede consultarse desde la cuenta.
4. Si se rechaza, se muestra el motivo y se permite corregir y reenviar los antecedentes.
5. Se bloquean envíos duplicados que ya estén pendientes o aprobados. Los documentos se mantienen privados.

### US-03 Presentación de certificaciones

**Prioridad:** Must have.

Como trabajador, quiero presentar mis certificaciones para publicar servicios en las categorías que requieren acreditación.

**Criterios de aceptación**

1. Se permite seleccionar una categoría que requiere certificación y adjuntar un archivo PDF, JPEG, PNG o WebP de hasta 5 MB.
2. La certificación queda asociada al trabajador y a la categoría, en estado PENDIENTE.
3. Se pueden presentar documentos para distintas categorías, sin duplicar una certificación pendiente o aprobada de la misma categoría.
4. El trabajador puede consultar el resultado y, en caso de rechazo, el motivo y la opción de reenviar el documento corregido.
5. La publicación en esa categoría se habilita después de la aprobación administrativa correspondiente.

### US-04 Publicación y gestión de servicios

**Prioridad:** Must have.

Como trabajador habilitado, quiero crear, editar y desactivar mis servicios para mantener actualizada mi oferta.

**Criterios de aceptación**

1. La publicación requiere identidad aprobada y, cuando corresponde, certificación aprobada para la categoría.
2. Cada servicio registra categoría, nombre, descripción, tarifa base en CLP, duración, modalidad y ubicación pública.
3. Los servicios a domicilio incluyen una referencia de ubicación y cobertura; los servicios en taller indican la ubicación y comuna del taller.
4. Un trabajador puede mantener hasta cinco servicios activos y solo puede modificar sus propias ofertas.
5. Al desactivar un servicio, este deja de estar disponible para nuevas contrataciones.

### US-21 Actualización del perfil del cliente

**Prioridad:** Must have.

Como cliente, quiero consultar y actualizar mis datos para mantener vigente la información de contacto y atención.

**Criterios de aceptación**

1. El cliente puede consultar y editar los campos permitidos de su perfil, incluida la dirección y la comuna.
2. Se validan los datos antes de guardarlos y se informa el resultado de la actualización.
3. Solo el titular puede modificar su perfil; estos cambios no le conceden permisos de trabajador.
4. La desactivación de la cuenta requiere confirmación e impide continuar utilizándola como cuenta activa.

### US-24 Cambio entre modo cliente y trabajador

**Prioridad:** Should have.

Como usuario habilitado, quiero cambiar el modo activo de mi cuenta para contratar servicios o trabajar según lo que necesite hacer.

**Criterios de aceptación**

1. La cuenta muestra el modo activo y los modos disponibles.
2. Para activar el modo trabajador, el usuario debe tener el perfil y la identidad aprobados.
3. El cambio actualiza la navegación y conserva los datos, perfiles y documentos de la cuenta.
4. Una cuenta inactiva o sin la habilitación necesaria no puede activar el modo trabajador.

## EP-02 Búsqueda y descubrimiento de servicios

### US-05 Exploración del catálogo

**Prioridad:** Must have.

Como cliente, quiero explorar los servicios por categoría para conocer la oferta disponible.

**Criterios de aceptación**

1. El catálogo presenta las categorías activas y permite consultar sus servicios.
2. Cada tarjeta identifica el servicio, el trabajador, la modalidad y la tarifa base.
3. Se muestran ofertas activas de trabajadores habilitados, con la certificación aprobada cuando corresponde.
4. La pantalla informa si está cargando, si hubo un error o si no hay servicios, y permite abrir el detalle de una oferta.

### US-06 Búsqueda por texto

**Prioridad:** Must have.

Como cliente, quiero buscar servicios por palabras clave para encontrar una oferta relacionada con mi necesidad.

**Criterios de aceptación**

1. La búsqueda considera el nombre y la descripción del servicio.
2. Los resultados pueden combinarse con los filtros del catálogo.
3. Si no hay coincidencias, se informa al cliente.
4. Se pueden cargar más resultados sin duplicar los servicios ya mostrados.

### US-07 Filtros del catálogo

**Prioridad:** Should have.

Como cliente, quiero filtrar los servicios para encontrar opciones que se ajusten a mi presupuesto y modalidad de atención.

**Criterios de aceptación**

1. Se puede filtrar por categoría, modalidad y rango de precio.
2. Los filtros seleccionados se aplican juntos y pueden combinarse con la búsqueda por texto.
3. Si el precio mínimo supera al máximo, se informa el error y se solicita corregirlo.
4. Se permite limpiar los filtros y se informa cuando no existen coincidencias.

### US-08 Detalle del servicio y del trabajador

**Prioridad:** Must have.

Como cliente, quiero revisar el detalle de un servicio y los datos públicos del trabajador para decidir si envío una solicitud.

**Criterios de aceptación**

1. El detalle muestra nombre, descripción, tarifa base, duración y modalidad del servicio.
2. Se identifica al trabajador y se presenta la ubicación o cobertura de la oferta.
3. Se permite consultar la disponibilidad e iniciar una solicitud.
4. Se puede consultar la reputación disponible del trabajador. Si todavía no tiene calificaciones, se informa esa condición.
5. Un servicio desactivado o no disponible no puede contratarse desde información desactualizada.

### US-22 Mapa de servicios y cobertura

**Prioridad:** Should have.

Como cliente, quiero ver las ofertas en un mapa para conocer su ubicación y cobertura.

**Criterios de aceptación**

1. El mapa muestra las ofertas disponibles que tienen coordenadas registradas.
2. Se distingue la ubicación de un taller de la referencia y cobertura de un servicio a domicilio.
3. Al seleccionar una oferta, se muestran sus datos básicos y se permite abrir su detalle.
4. El cliente puede indicar una ubicación de referencia para consultar la cercanía en esa pantalla.

## EP-03 Solicitud, agendamiento y gestión de servicios

### US-09 Solicitud de un servicio

**Prioridad:** Must have.

Como cliente, quiero solicitar un servicio en una fecha y horario disponibles para coordinar la atención con el trabajador.

**Criterios de aceptación**

1. La solicitud identifica al servicio, al cliente y al trabajador, con una fecha y hora futuras dentro de la disponibilidad publicada.
2. La modalidad corresponde a la oferta. A domicilio, el cliente indica dirección y comuna; en taller, se utiliza la ubicación definida por el trabajador.
3. Una solicitud válida queda en estado PENDIENTE y conserva las condiciones del servicio para su seguimiento.
4. Se impide registrar solicitudes con conflictos de horario o duplicaciones incompatibles y se informa el motivo.
5. Un cliente no puede crear solicitudes en nombre de otra persona.

### US-10 Respuesta a las solicitudes

**Prioridad:** Must have.

Como trabajador, quiero aceptar o rechazar las solicitudes recibidas para comprometer los trabajos que puedo realizar.

**Criterios de aceptación**

1. El trabajador puede consultar las solicitudes de sus servicios y revisar sus condiciones.
2. Solo el trabajador correspondiente puede aceptar o rechazar una solicitud PENDIENTE.
3. La aceptación comprueba que no exista un compromiso de horario incompatible.
4. El cliente puede consultar el resultado actualizado de su solicitud.
5. Se impiden respuestas de terceros y cambios incompatibles con el estado actual.

### US-11 Disponibilidad y agenda

**Prioridad:** Should have.

Como trabajador, quiero administrar mis horarios y consultar mis solicitudes para organizar los trabajos que debo atender.

**Criterios de aceptación**

1. El trabajador puede registrar y eliminar bloques de disponibilidad de sus propios servicios, con fechas y duraciones válidas.
2. La agenda permite distinguir las solicitudes pendientes y los compromisos activos.
3. Las solicitudes se consultan por fecha y estado, sin mostrar las de otros trabajadores.
4. Los trabajos aceptados se consideran al validar la disponibilidad para nuevas solicitudes.

### US-12 Seguimiento y finalización del servicio

**Prioridad:** Must have.

Como cliente o trabajador, quiero consultar el avance de mis solicitudes y confirmar el término de la atención para mantener un registro del servicio.

**Criterios de aceptación**

1. Cada participante puede consultar sus solicitudes activas e históricas, con sus datos y estado actualizados.
2. A domicilio, el flujo después del pago es PAGADA, EN_CAMINO, EN_CURSO y COMPLETADA.
3. En taller, el flujo después del pago es PAGADA, EN_CURSO, LISTO y COMPLETADA.
4. Para finalizar, el cliente genera un código de cuatro dígitos y el trabajador lo ingresa en el estado permitido.
5. El código tiene una vigencia de 24 horas. Se bloquea la finalización con un código incorrecto o vencido y se aplican los controles de intento.
6. Los participantes pueden cancelar antes del pago, en estado PENDIENTE o ACEPTADA, indicando el motivo. Se bloquean los cambios de estado no permitidos.
7. El historial conserva los registros existentes y permite consultar más resultados mediante paginación.

### US-25 Notificaciones de la cuenta

**Prioridad:** Should have.

Como cliente o trabajador, quiero consultar mis avisos para conocer cambios relevantes en mis solicitudes y verificaciones.

**Criterios de aceptación**

1. La cuenta muestra sus notificaciones internas y el indicador de avisos sin leer.
2. Cuando corresponde, el aviso permite abrir la solicitud, verificación o certificación relacionada.
3. Se pueden marcar avisos como leídos y limpiar la lista.
4. Cada usuario accede únicamente a sus propias notificaciones.

## EP-04 Comunicación contextual y pagos seguros

### US-13 Inicio del pago

**Prioridad:** Must have.

Como cliente, quiero revisar el monto e iniciar el pago de una solicitud aceptada para continuar con la contratación.

**Criterios de aceptación**

1. La aplicación muestra la tarifa base, la comisión del 15 % y el total en CLP.
2. El pago solo puede iniciarse por el cliente de la solicitud y cuando esta se encuentra ACEPTADA.
3. Se abre el checkout de prueba vinculado a la solicitud.
4. Abrir o abandonar el checkout no marca la solicitud como pagada. Los errores de inicio se informan al cliente.

### US-14 Confirmación del pago con Mercado Pago

**Prioridad:** Must have.

Como cliente, quiero completar el pago de prueba y consultar su resultado para saber si puedo continuar con la atención.

**Criterios de aceptación**

1. El pago utiliza Mercado Pago en modo de prueba y queda relacionado con la solicitud y el cliente.
2. El sistema comprueba con el proveedor la referencia, el monto, la moneda y la cuenta de prueba antes de confirmar el pago.
3. Volver desde la pasarela a la aplicación no basta para darlo por aprobado.
4. Un pago válido se registra una sola vez y cambia la solicitud a PAGADA.
5. Un resultado pendiente, rechazado o inválido se muestra sin presentarlo como pago aprobado.

### US-15 Consulta del comprobante

**Prioridad:** Should have.

Como cliente, quiero consultar el comprobante de mi pago de prueba para tener un respaldo de la operación registrada.

**Criterios de aceptación**

1. Al aprobarse el pago, se muestra su identificador y la referencia de Mercado Pago cuando está disponible.
2. El comprobante incluye la tarifa base, la comisión, el total y la moneda.
3. El acceso se limita a los participantes de la solicitud.
4. Una operación todavía no aprobada no se muestra como comprobante de un pago aprobado.

### US-16 Comisión y ganancias del trabajador

**Prioridad:** Must have.

Como trabajador, quiero consultar los importes de mis servicios para distinguir las ganancias de trabajos completados y en curso.

**Criterios de aceptación**

1. La comisión corresponde al 15 % de la tarifa base, redondeada a pesos enteros, y se agrega al monto pagado por el cliente.
2. La tarifa base se utiliza como ingreso de referencia del trabajador.
3. El trabajador puede seleccionar un mes y consultar los totales y movimientos de sus servicios completados y en curso.
4. El resumen presenta el desglose diario del mes y permite consultar más movimientos mediante paginación.
5. Solo se muestran los datos del trabajador autenticado, identificados como importes de prueba.

### US-23 Chat de la solicitud

**Prioridad:** Should have.

Como cliente o trabajador, quiero conversar con la otra persona de una solicitud para coordinar los detalles de la atención.

**Criterios de aceptación**

1. El chat pertenece a una solicitud y solo permite el acceso de sus participantes.
2. Se pueden enviar mensajes de texto válidos y consultar la conversación.
3. Los mensajes se actualizan periódicamente mientras la pantalla está activa y se informa si falla su carga o envío.
4. Al terminar el servicio, la conversación deja de estar disponible según su ciclo de cierre.

## EP-05 Reputación, evaluaciones y administración del sistema

En la aplicación, esta épica reúne las calificaciones y la reputación del trabajador. La revisión manual de documentos se describe al final, en los procedimientos internos.

### US-17 Calificación de un servicio

**Prioridad:** Should have.

Como cliente, quiero calificar un servicio completado para compartir mi experiencia con otros usuarios.

**Criterios de aceptación**

1. Solo el cliente de una solicitud COMPLETADA puede calificarla.
2. La puntuación debe ser un número entero entre 1 y 5. El comentario es opcional y admite hasta 1000 caracteres.
3. Cada solicitud permite una sola calificación; repetir el mismo envío no crea otra.
4. Se impide calificar solicitudes ajenas o no completadas y se informa el resultado del envío.

### US-18 Reputación del trabajador

**Prioridad:** Should have.

Como cliente, quiero consultar las calificaciones de un trabajador para considerar su reputación antes de contratar.

**Criterios de aceptación**

1. Se muestra el promedio y la cantidad de calificaciones válidas del trabajador.
2. Una nueva calificación se incluye al actualizar la consulta.
3. Las reseñas muestran la puntuación y el comentario disponible, y permiten consultar más resultados.
4. Si todavía no hay calificaciones, se informa esa condición sin asignar un promedio ficticio.

## Condiciones generales de aceptación

- Las funciones protegidas requieren una sesión válida y los permisos del perfil activo.
- Los usuarios solo pueden modificar sus propios datos o los registros en los que tienen autorización para intervenir.
- Los documentos de identidad y certificaciones se mantienen privados.
- Los formularios informan errores de validación y las pantallas distinguen carga, error y ausencia de resultados.
- La aceptación de cada historia se comprueba mediante sus criterios y las pruebas correspondientes.

## Procedimientos internos

### Revisión manual de identidad y certificaciones

La persona responsable revisa los antecedentes mediante Supabase Dashboard y los accesos autorizados. Esta actividad corresponde a la antigua US-19 y se mantiene como procedimiento operativo.

1. Consultar los envíos pendientes y comprobar sus documentos.
2. Registrar el resultado como APROBADA o RECHAZADA. Un rechazo debe incluir el motivo para que el usuario pueda corregir sus antecedentes.
3. Mantener los documentos privados y limitar su revisión a personas autorizadas.
4. Comprobar que la publicación de servicios exija identidad aprobada y, cuando corresponda, certificación aprobada para la categoría.

La consulta de registros en Supabase Dashboard, antes identificada como US-20, se retira del listado de historias de la aplicación. Se conservan los identificadores de las demás historias.
