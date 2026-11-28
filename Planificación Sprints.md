# Planificación y ejecución de los Sprints de ServiMatch

El desarrollo se organizó en seis incrementos funcionales. Las fechas de ejecución y la organización del trabajo se actualizaron con la información confirmada por el equipo en `CONCILIACION_SPRINTS.md`. Las tablas de tareas conservan el desglose de planificación disponible y no constituyen por sí solas un registro de aceptación o ejecución satisfactoria de pruebas.

## Organización y cierre de los incrementos

El equipo utilizó dos semanas como referencia flexible de planificación y ajustó la duración según el trabajo de cada incremento. Las tareas se planificaron con apoyo de inteligencia artificial y sirvieron de guía para ordenar el desarrollo. Desde el inicio se acordaron sesiones los lunes, martes y viernes de 20:00 a 23:00, considerando la disponibilidad de los tres integrantes. Estas sesiones permitían coordinar actividades, resolver dudas y revisar decisiones para mantener el desarrollo alineado con el alcance, trabajando juntos o distribuyéndose actividades en paralelo.

Todos los incrementos incluían trabajo final de pruebas. El criterio práctico de cierre comunicado por el equipo consistía en completar las tareas, realizar pruebas con asistencia de IA y comprobar manualmente el funcionamiento, para avanzar al siguiente incremento. El Sprint 6 también incluyó la preparación de la presentación y la demostración, y un periodo sin actividad antes de su cierre registrado. Las fechas concretas se muestran al final de este documento; los incrementos tuvieron duraciones variables.

Las sesiones se describen como trabajo y coordinación del equipo. Las ceremonias y sus acuerdos se documentarán según lo que realmente se haya realizado. Las pruebas se relacionarán con los criterios de aceptación y la evidencia disponible, distinguiendo los resultados históricos de las nuevas comprobaciones.

### Participación del equipo

Sebastián Almendras y Matías Maldonado participaron en la implementación asistida por IA y concentraron la operación de Codex durante las sesiones. Esteban participó activamente, especialmente en la revisión de la base de datos. Los tres intervenían en la coordinación y la revisión del trabajo. La disponibilidad de herramientas influyó en la ejecución de las actividades y se combinó con la revisión técnica y las decisiones conjuntas.

Al conciliar las tareas se identificarán el responsable principal y los participantes según sus contribuciones. Los aportes descritos no representan una asignación exclusiva por área ni permiten identificar automáticamente las etiquetas Dev 1, Dev 2 y Dev 3 de las tablas originales.

### Consolidación de pruebas

Un integrante está consolidando un informe de pruebas por Sprint con los casos realizados y las evidencias disponibles. Los informes distinguirán la fecha de elaboración de la fecha de ejecución, cuando esta se conozca, y relacionarán los casos con las tareas y criterios de aceptación. Las nuevas ejecuciones se identificarán como validaciones posteriores o regresiones.

## Capacidad y estimaciones

Sebastián asignó manualmente los puntos según la dificultad relativa prevista para las tareas, tomando Fibonacci como referencia. Estas estimaciones orientaron la organización del trabajo. El equipo no utilizó cálculos formales de velocidad (velocity) o capacidad (capacity) para seleccionar el trabajo de los Sprints; los análisis de disponibilidad que se incluyen ahora son retrospectivos.

El horario acordado permite calcular una disponibilidad de referencia de 9 horas semanales por integrante y 27 horas-persona semanales para los tres integrantes. Una ventana completa de dos semanas representa 54 horas-persona de referencia. La dedicación efectiva de cada Sprint requiere considerar sus sesiones reales y distribuir los días de transición compartidos: 25/09, 02/10 y 06/10. La misma sesión no se contará íntegramente en dos Sprints. En el Sprint 6 se deben distinguir las pruebas, la preparación de la presentación y la demo, y el periodo sin actividad antes del cierre; el calendario no acredita horas efectivamente trabajadas.

Los valores de SP y las asignaciones Dev 1, Dev 2 y Dev 3 de la tabla original del Sprint 1 se conservan como datos de planificación de este archivo, pendientes de conciliar con las historias, los Sprint Backlogs y los responsables identificados. Se comprobarán la unidad de estimación y las diferencias entre los registros antes de elaborar métricas retrospectivas. No se han agregado estimaciones faltantes ni calculado velocidad a partir de estos valores.

## Sprint 1 Docker y autenticación

**Periodo confirmado:** 1 al 25 de septiembre de 2026.

**Objetivo:** Infrastructure Docker + registro/login funcional

| #   | Tarea                                                 | Asignado | SP  |
| --- | ----------------------------------------------------- | -------- | --- |
| 1   | Crear estructura de carpetas + repositorio            | Dev 3    | 2   |
| 2   | docker-compose.yml + Dockerfile + .env.example        | Dev 3    | 3   |
| 3   | README con instrucciones de levantamiento             | Dev 3    | 1   |
| 4   | Modelo `User` (rol cliente/trabajador) + migración    | Dev 1    | 3   |
| 5   | Endpoints auth: register, login, refresh, me (JWT)    | Dev 1    | 5   |
| 6   | Pantallas: Login, Registro (selección de perfil)      | Dev 2    | 5   |
| 7   | Servicio auth en TS + almacenamiento seguro tokens    | Dev 2    | 3   |
| 8   | Navegación condicional por sesión/rol                 | Dev 2    | 2   |
| 9   | Tests unitarios auth (register, login, token refresh) | Dev 1    | 3   |
| 10  | Tests integración endpoints auth                      | Dev 3    | 2   |

**Demo:** `docker-compose up` → app registra usuario → login → logout

---

## Sprint 2 Perfiles y verificación

**Periodo confirmado:** 25 de septiembre al 2 de octubre de 2026.

**Objetivo:** Perfil cliente completo + verificación simplificada de trabajador

| #   | Tarea                                                          |
| --- | -------------------------------------------------------------- |
| 1   | CRUD perfil cliente (datos, dirección, comuna)                 |
| 2   | Modelo `Verification` + endpoints (upload docs, cambio status) |
| 3   | Regla: sin verificación aprobada → no puede publicar           |
| 4   | Pantalla perfil cliente con "Solicitar rol trabajador"         |
| 5   | Flujo verificación: subir documentos → ver "En revisión"       |
| 6   | Tests unitarios perfil y verificación                          |
| 7   | Tests integración endpoints verificación                       |

**Demo:** cliente edita perfil → solicita rol trabajador → admin aprueba → trabajador puede publicar

---

## Sprint 3 Catálogo y publicación

**Periodo confirmado:** 2 al 6 de octubre de 2026.

**Objetivo:** Clientes buscan servicios, trabajadores publican

| #   | Tarea                                                                     |
| --- | ------------------------------------------------------------------------- |
| 1   | Modelos `Category`, `Service` + seeds de categorías                       |
| 2   | Endpoints catálogo: categories, services (filtros), service/{id}          |
| 3   | Endpoints trabajador: CRUD servicios propios                              |
| 4   | Pantalla Home (categorías, destacados)                                    |
| 5   | Pantalla Búsqueda + Detalle del servicio                                  |
| 6   | Formulario "Publicar servicio" (trabajador)                               |
| 7   | Pantalla "Mapa de cobertura" con marcadores fijos de locales              |
| 8   | Seeds de datos de prueba (categorías, servicios, locales con coordenadas) |
| 9   | Tests unitarios catálogo y publicación                                    |
| 10  | Tests integración endpoints catálogo                                      |

**Demo:** trabajador publica servicio → cliente lo busca → ve detalle y mapa con ubicación del taller

---

## Sprint 4 Agendamiento y estados

**Periodo confirmado:** 6 al 9 de octubre de 2026.

**Objetivo:** Solicitud de servicio con máquina de estados completa

| #   | Tarea                                                         |
| --- | ------------------------------------------------------------- |
| 1   | Modelo `Booking` (fecha, hora, modalidad, estado)             |
| 2   | Endpoints: crear, listar, accept/reject/start/complete/cancel |
| 3   | Máquina de estados explícita (transiciones válidas/inválidas) |
| 4   | Pantalla Agendar (fecha/hora + modalidad + dirección)         |
| 5   | Pantalla Tracking (stepper de estados)                        |
| 6   | Panel trabajador: agenda, solicitudes, aceptar/rechazar       |
| 7   | Tests unitarios máquina de estados                            |
| 8   | Tests integración endpoints bookings                          |

**Demo:** cliente agenda → trabajador acepta → ambos ven tracking de estados

---

## Sprint 5 Chat pagos y reseñas

**Periodo confirmado:** 13 al 16 de octubre de 2026.

**Objetivo:** Comunicación, pago de prueba y calificaciones.

La planificación disponible contemplaba inicialmente pago simulado. El incremento incorporó Mercado Pago en modo de prueba y, según la confirmación del equipo, ya funcionaba al cierre del 16 de octubre. El commit del 17 de octubre corresponde a su registro posterior en Git. Se conserva a continuación el desglose inicial; su evolución debe reflejarse en el Backlog, la Review y la Release del Sprint.

| #   | Tarea                                                      |
| --- | ---------------------------------------------------------- |
| 1   | Modelos `Conversation`, `Message` + endpoints CRUD         |
| 2   | Modelo `Payment` + lógica comisión 15% (simulada)          |
| 3   | Modelo `Review` (rating 1-5, comentario) + endpoints       |
| 4   | Pantalla Chat (polling cada 3s, ligada al booking)         |
| 5   | Pantalla Pago simulado (botón "Confirmar pago" + desglose) |
| 6   | Pantalla Calificación (estrellas interactivas)             |
| 7   | Ganancias del trabajador (gráfico simple)                  |
| 8   | Tests unitarios chat, pagos, reseñas                       |
| 9   | Tests integración endpoints chat y pagos                   |

**Demo:** cliente paga (simulado) → califica 5★ → reseña aparece en perfil trabajador

---

## Sprint 6 Pulido y demostración final

**Periodo confirmado:** 19 de octubre al 23 de noviembre de 2026.

**Objetivo:** Preparar presentación del proyecto de título

El equipo informa que este incremento combinó pruebas y ajustes finales con una dedicación importante a la preparación de la presentación del título y la demo. También existió un periodo sin actividad antes del cierre registrado del 23 de noviembre. Las fechas de implementación, validación, preparación y cierre se distinguirán al vincular sus evidencias; la duración total del incremento no representa trabajo continuo en desarrollo o pruebas.

| #   | Tarea                                                           |
| --- | --------------------------------------------------------------- |
| 1   | Revisar flujo completo cliente vs prototipo                     |
| 2   | Revisar flujo completo trabajador vs prototipo                  |
| 3   | Accesibilidad: alto contraste, tamaños de texto                 |
| 4   | Performance: FlatList, optimización de renders                  |
| 5   | Actualizar README con screenshots y diagramas                   |
| 6   | Seeds de demo (usuarios, servicios, bookings de prueba)         |
| 7   | Preparar presentación del título (slides, video demo)           |
| 8   | Tests de rendimiento (Locust/k6) - endpoints críticos           |
| 9   | Revisión de seguridad (CORS, tokens, validación, SQL injection) |
| 10  | Testing manual final completo                                   |

**Demo:** Demostración completa del sistema para el jurado del título

---

## Resumen de ejecución

Fechas de inicio y cierre efectivos informadas por el equipo desde Jira. Las fechas de transición compartidas no implican una jornada completa de dedicación a cada Sprint.

| Sprint | Inicio | Cierre | Enfoque |
| --- | --- | --- | --- |
| 1 | 01/09/2026 | 25/09/2026 | Entorno, autenticación y pruebas |
| 2 | 25/09/2026 | 02/10/2026 | Perfiles, verificación y pruebas |
| 3 | 02/10/2026 | 06/10/2026 | Catálogo, publicación, mapa y pruebas |
| 4 | 06/10/2026 | 09/10/2026 | Agendamiento, estados y pruebas |
| 5 | 13/10/2026 | 16/10/2026 | Chat, pagos de prueba, reseñas y pruebas |
| 6 | 19/10/2026 | 23/11/2026 | Calidad, revisión y preparación de la demostración |

Los Sprints 1 y 6 abarcaron más de dos semanas; los demás tuvieron ventanas más breves. El alcance terminado, los resultados de pruebas y las estimaciones se conciliarán en los registros de cada incremento.
