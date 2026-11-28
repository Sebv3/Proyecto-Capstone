# Conciliación de los Sprints de ServiMatch

Estado: organización general consolidada con la información aportada por el equipo; conciliación de registros por Sprint pendiente.

ServiMatch cuenta con incrementos de autenticación, perfiles, catálogo, solicitudes, pagos y mejoras finales. Esta base reúne su alcance y evidencia técnica para actualizar la documentación de gestión después del desarrollo. El equipo ha informado el horario de trabajo y las fechas de inicio y cierre efectivos registradas en Jira. Su conciliación con las tareas, las estimaciones originales y los resultados de prueba sigue pendiente.

## Información aportada por el equipo

Sebastián informa que el equipo priorizó el desarrollo por el tiempo disponible y conservó pocos registros de gestión. Los Sprints se planificaban con una referencia flexible de dos semanas. Algunos se completaron en menos tiempo por tener una menor cantidad de tareas; el equipo describe un avance generalmente acorde con los plazos estimados.

Desde el inicio del proyecto, el equipo acordó sesiones los lunes, martes y viernes de 20:00 a 23:00, considerando la disponibilidad de sus integrantes. Según lo informado, Sebastián Almendras, Matías Maldonado y Esteban participaban en las sesiones para coordinar actividades, revisar decisiones y mantener el desarrollo alineado con el alcance. Durante esas tres horas podían trabajar juntos o distribuirse tareas en paralelo. No se ha cuantificado trabajo adicional fuera de ese horario.

La planificación de las tareas se realizó con ayuda de inteligencia artificial y se utilizó como guía para ordenar el desarrollo. Sebastián asignó manualmente los puntos según la dificultad relativa que estimaba para las tareas, tomando Fibonacci como referencia. La correspondencia de los valores entre los documentos requiere conciliación. La selección del trabajo se apoyaba en estas estimaciones y en la disponibilidad acordada; el equipo no utilizó cálculos de velocidad (velocity) o capacidad (capacity) como método formal de planificación durante el proyecto.

Una tarea se daba por terminada después de realizar pruebas con asistencia de IA y pruebas funcionales manuales. Todos los Sprints incluían trabajo final de pruebas, según lo informado. En los incrementos previos al último, al completar las tareas y comprobar su funcionamiento, el equipo pasaba al siguiente incremento. El Sprint 6 combinó pruebas con preparación de la presentación del título y la demostración, y tuvo un periodo sin actividad antes del cierre registrado. La clasificación técnica y los resultados de cada prueba se completarán con las evidencias correspondientes.

Estas declaraciones describen la experiencia del equipo. Las fechas registradas y las de incorporación de código se mantienen diferenciadas. Los cálculos de disponibilidad incluidos en este documento son una reconstrucción posterior a partir del horario informado. La estimación de puntos sí se realizó durante el proyecto; la consolidación actual debe recuperar sus valores y fuentes antes de elaborar métricas retrospectivas.

## Organización del trabajo

El desarrollo se organizó por incrementos funcionales, con planificación de tareas asistida por IA y sesiones de tres horas los lunes, martes y viernes. La referencia temporal de dos semanas se ajustaba según el trabajo del incremento. Para la documentación se propone describir esta organización como un enfoque iterativo e incremental con prácticas de Scrum adaptadas al contexto académico.

Las sesiones conjuntas de trabajo y coordinación se acordaron al inicio según la disponibilidad de los tres integrantes. Permitían distribuir actividades, resolver dudas y revisar el trabajo para mantener una línea común de desarrollo. Se documentarán con esta finalidad; el medio utilizado y los acuerdos específicos se completarán cuando exista información para respaldarlos.

### Participación y distribución de actividades

La ejecución de las actividades combinó implementación asistida por IA, revisión técnica y decisiones conjuntas. La disponibilidad de herramientas influyó en quién operaba Codex durante las sesiones. Sebastián Almendras y Matías Maldonado concentraron esa operación, mientras que Esteban participó activamente, especialmente en la revisión de la base de datos. Los tres intervenían en el seguimiento y la revisión del trabajo.

Esta descripción recoge aportes principales y no establece una asignación exclusiva por área. Para conciliar las tareas se identificarán el responsable principal y los participantes según los registros y el trabajo informado. Las etiquetas Dev 1, Dev 2 y Dev 3 se mantienen pendientes de relacionar con personas y contribuciones concretas; el acceso a Codex por sí solo no determina la autoría ni la responsabilidad de una tarea.

La IA apoyó la planificación, la implementación y las pruebas. La revisión y las decisiones del equipo forman parte de la ejecución y se distinguirán de las operaciones realizadas con la herramienta.

## Criterio de cierre aplicado

El criterio práctico comunicado por el equipo fue completar la funcionalidad, realizar pruebas con apoyo de IA y comprobar manualmente su funcionamiento. El trabajo final de pruebas formaba parte de cada incremento y permitía avanzar al siguiente. En el último incremento también se prepararon la presentación y la demostración; su cierre en Jira incluyó un periodo previo sin actividad. Para respaldar cada cierre se relacionará la tarea con el comportamiento esperado, el resultado observado y la evidencia disponible.

La revisión posterior de la documentación añadirá la trazabilidad hacia los criterios de aceptación de las historias. Esta trazabilidad no se presentará como un registro contemporáneo si se construye después del desarrollo.

## Base de los seis incrementos

La asociación siguiente sigue los temas de `Planificación Sprints.md` y los cambios versionados. Un commit fecha la incorporación de cambios al repositorio; no acredita por sí solo el inicio del trabajo, una reunión, la ejecución satisfactoria de pruebas o la aceptación del incremento.

| Sprint | Objetivo de referencia | Evidencia técnica inicial | Información por completar |
| --- | --- | --- | --- |
| 1 | Preparar el entorno y habilitar autenticación | `994f9a3` del 04/09/2026: entorno; `487b9eb` y `a70ab93` del 15/09: login, registro y validaciones; `a5ccfae` del 22/09: tareas de sesión | Actualizar los documentos con el cierre corregido del 25/09; recuperar estimaciones y evidencia de aceptación |
| 2 | Completar perfiles y verificación | `edc9d37` del 25/09/2026: perfiles, documentos y pruebas; `60b4563` del 29/09: solicitud de rol; `174f357` y `ee25d60` del 02/10: sincronización de rol y reglas de BD | Qué historias se seleccionaron al inicio y qué ajustes se incorporaron después |
| 3 | Habilitar catálogo, publicación y mapa | `013bcf0` del 02/10/2026: catálogo y Home; `087ea04` del 05/10: publicación y mapa; `f0c723c` del 06/10: pruebas; `3dc2f0d` del 06/10: edición y desactivación | Actualizar el cierre al 06/10, registrar los cambios de alcance y relacionar historias con tareas técnicas |
| 4 | Permitir agendamiento y controlar estados | `f0c723c` y `903ee06` del 06/10/2026: modelo, operaciones y agenda; `2ed1c94` y `15bbb32` del 09/10: solicitudes e integración; `0ebb1b2` del 10/10: ajustes posteriores | Distribuir la sesión de transición del 06/10 y documentar el resultado aceptado al cierre y los ajustes posteriores |
| 5 | Integrar comunicación, pagos y reputación | `5283105` del 13/10/2026: chat, pago simulado, reseñas y pruebas; `f4d8dde` del 16/10: ganancias; `29e7f8b` del 17/10: registro en Git de Mercado Pago de prueba, que según Sebastián ya funcionaba al cierre del 16/10 | Vincular la evidencia de validación del checkout y del recorrido de pago al cierre del Sprint |
| 6 | Revisar calidad y preparar la demostración | `6eb4f1e` del 20/10/2026: accesibilidad y listas; `18b6c16` y `5264a09` del 26/10: seguridad y laboratorio de carga; `8daefee` del 03/11 y `9bf2265` del 05/11: cambios y mejoras finales | Reflejar el cierre del 23/11 en los documentos del Sprint y vincular las evidencias de pruebas y preparación de la presentación y demo; precisar las fechas de actividad y del periodo previo sin actividad si hay registros |

## Fechas y cumplimiento de plazos

Las dos semanas eran una referencia flexible según lo confirmado por Sebastián. El equipo informa que pasaba al siguiente incremento después de completar las tareas y sus pruebas, sin esperar necesariamente a completar las dos semanas.

### Fechas registradas en Jira

Sebastián confirmó y corrigió las siguientes fechas como inicio y cierre efectivos de los Sprints en Jira. Esta tabla sustituye los rangos comunicados anteriormente. Se mantienen como información aportada por el equipo; aún no se ha incorporado una exportación del historial de Jira con tareas y marcas de tiempo.

| Sprint | Inicio registrado | Cierre registrado |
| --- | --- | --- |
| 1 | 01/09/2026 | 25/09/2026 |
| 2 | 25/09/2026 | 02/10/2026 |
| 3 | 02/10/2026 | 06/10/2026 |
| 4 | 06/10/2026 | 09/10/2026 |
| 5 | 13/10/2026 | 16/10/2026 |
| 6 | 19/10/2026 | 23/11/2026 |

### Resultado de la conciliación de fechas

- El Sprint 1 finaliza el 25/09. Los cambios de autenticación del 15 y 22/09 quedan dentro de su ventana y dejan de constituir una discrepancia temporal. La sesión del 25/09 debe distribuirse entre el cierre del Sprint 1 y el inicio del Sprint 2.
- Los Sprints 2 y 3 comparten el 02/10 como fecha de transición. La sesión de ese día no puede asignarse íntegramente a ambos sin comprobar su distribución.
- El Sprint 3 finaliza el 06/10 y el Sprint 4 comienza ese mismo día. El solapamiento de varios días queda resuelto por la corrección del cierre del Sprint 3. El commit `f0c723c` del 06/10 contiene pruebas de catálogo y cambios de solicitudes; ese mismo día `903ee06` incorpora agenda. La sesión de transición requiere distribuirse entre ambos incrementos.
- El Sprint 5 finaliza el 16/10. Sebastián confirmó que Mercado Pago ya funcionaba cuando terminaron el Sprint. El commit `29e7f8b` del 17/10 se registra como incorporación posterior al historial de Git de una funcionalidad disponible al cierre, según el testimonio del equipo. Se distingue la disponibilidad funcional informada de la fecha del commit; la diferencia ya no se considera un pendiente sobre el momento de desarrollo. Queda por vincular la evidencia de validación correspondiente.
- El Sprint 6 finaliza el 23/11. Los hitos del 26/10 y del 03 y 05/11 están dentro del incremento. Según el equipo, una parte importante del tiempo se dedicó a preparar la presentación del título y la demo, además de realizar pruebas. También hubo un periodo sin actividad antes del cierre. Las fechas concretas de estas actividades y de ese periodo se precisarán si existen registros; la ventana completa no representa trabajo continuo de implementación o pruebas.

Para cada incremento se diferenciarán las fechas registradas en Jira, el plazo previsto originalmente, los hitos de código y la validación funcional. Los Sprints 1 a 4 presentan fechas de transición consecutivas. Las ventanas informadas dejan intervalos del 10 al 12/10 y del 17 al 18/10, cuya existencia no permite inferir por sí sola ausencia de actividad.

Los Sprints tuvieron duraciones variables. El Sprint 1 y el Sprint 6 superaron la referencia de dos semanas; por ello no se describirán como seis Sprints de duración fija ni se afirmará cumplimiento exacto de una duración de dos semanas en todos los casos. El cumplimiento de compromisos de alcance y plazo se documentará por separado.

Las fechas de los commits pueden respaldar hitos técnicos, pero no deben convertirse automáticamente en las fechas oficiales del Sprint. La valoración de cumplimiento de plazos necesita comparar el resultado con el plazo acordado originalmente.

## Estimación y métricas

Usar una fila por historia de usuario para los puntos y relacionar sus tareas técnicas debajo de esa historia. Los puntos de una historia y los de sus subtareas no deben sumarse como trabajo adicional.

### Criterio de estimación aplicado

Sebastián estimó manualmente los puntos según la dificultad relativa prevista para las tareas, con Fibonacci como referencia. Los puntos se usaron para orientar la planificación. La revisión documental debe identificar si cada valor corresponde a una historia o a una tarea y resolver las diferencias entre los totales conservando su fuente.

La estimación original y el análisis posterior de métricas se documentan por separado. El equipo no planificó los Sprints mediante una velocidad histórica ni un cálculo formal de capacidad. Los análisis que se elaboren ahora se identificarán como retrospectivos. La comparación entre incrementos deberá considerar la consistencia de los puntos, su unidad y la duración variable de los Sprints.

### Capacidad de referencia

La frecuencia y el horario declarados permiten calcular la siguiente capacidad de referencia. Es una reconstrucción basada en el horario informado por el equipo, sin un registro individual de tiempos por tarea.

| Periodo | Sesiones | Horas por integrante | Horas-persona del equipo |
| --- | --- | --- | --- |
| Una sesión | 1 de 3 horas | 3 | 9 |
| Una semana completa | 3 de 3 horas | 9 | 27 |
| Una ventana completa de dos semanas | 6 de 3 horas | 18 | 54 |

El cálculo para dos semanas es `3 días por semana × 3 horas × 2 semanas × 3 integrantes = 54 horas-persona`. La unidad expresa disponibilidad agregada de los tres integrantes; no significa 54 horas transcurridas de conexión. El horario incluye el trabajo realizado en las sesiones y no se considera exclusivamente programación.

La capacidad de cada Sprint se completará según las fechas y sesiones que realmente abarcó. Con sesiones completas de tres horas y los tres integrantes, el cálculo es `número de sesiones del Sprint × 9 horas-persona`. Si dentro de una sesión trabajaron en más de un incremento, el tiempo deberá distribuirse para evitar contarlo dos veces. Los Sprints más cortos no recibirán automáticamente las 54 horas-persona de la ventana de referencia. El trabajo por separado dentro del horario acordado ya está incluido; no se sumará de nuevo.

### Sesiones posibles dentro de las fechas informadas

Este conteo incluye las fechas de inicio y cierre y los lunes, martes y viernes comprendidos entre ellas. No incorpora las horas exactas de apertura o cierre de Jira. Expresa disponibilidad de calendario antes de distribuir sesiones compartidas; no representa tiempo ya imputado a cada Sprint.

| Sprint | Sesiones posibles | Horas por integrante dentro de la ventana | Horas-persona dentro de la ventana |
| --- | --- | --- | --- |
| 1 | 11 | 33 | 99 |
| 2 | 4 | 12 | 36 |
| 3 | 3 | 9 | 27 |
| 4 | 2 | 6 | 18 |
| 5 | 2 | 6 | 18 |
| 6 | 16 | 48 | 144 |

El 25/09 está incluido en los Sprints 1 y 2; el 02/10, en los Sprints 2 y 3; y el 06/10, en los Sprints 3 y 4. Por ello, las horas de las filas no se sumarán como capacidad total asignada. Las ventanas contienen 35 fechas de sesión distintas, equivalentes a 315 horas-persona bajo el horario declarado; sumar las filas duplicaría 27 horas-persona. Este total se limita a la unión de las ventanas informadas y no incluye posibles sesiones fuera de ellas.

El conteo es mecánico por días de la semana: incluye cualquier fecha comprendida en las ventanas que coincida con lunes, martes o viernes. Se ajustará si el equipo informa sesiones suspendidas, abreviadas o dedicadas a actividades distintas. Las horas son una referencia reconstruida de disponibilidad, no un registro de esfuerzo ejecutado por tarea.

En particular, las 144 horas-persona de la ventana del Sprint 6 son una referencia teórica de calendario. El equipo confirmó actividades de pruebas, preparación de la presentación y la demo, y un periodo sin actividad antes del cierre. Por ello, esa cifra no se utilizará como horas efectivamente trabajadas ni como dedicación exclusiva al desarrollo. La distribución real requiere registros adicionales; no se asignarán horas a cada actividad a partir del calendario solamente.

La comparación del avance entre Sprints de distinta duración deberá indicar esa duración y el alcance. Un incremento completado antes del plazo es un resultado de cumplimiento temporal; por sí solo no establece una velocidad en puntos.

| Dato | Regla para completarlo |
| --- | --- |
| Story Points originales | Conservar los valores registrados durante el proyecto e identificar su fuente y unidad |
| Estimación retrospectiva | Si se realiza ahora, indicar su fecha y que sirve para revisión; no presentarla como estimación previa al Sprint |
| Capacidad disponible | Usar el horario de referencia de 27 horas-persona por semana y completar las sesiones o distribución de tiempo de cada Sprint; identificar la reconstrucción retrospectiva |
| Velocidad en SP | Sumar las historias terminadas de un Sprint con estimaciones consistentes; no calcular una velocidad histórica original con puntos asignados al terminar el proyecto |
| Cantidad de trabajo cerrado | Cuando no haya SP recuperables, mostrar historias o tareas terminadas, conservando el nombre de esa unidad |

## Evidencia de pruebas

El equipo declara que todos los Sprints incluían trabajo final de pruebas y que aplicaba pruebas asistidas por IA y pruebas funcionales manuales antes de pasar al siguiente incremento. Se conservará esa descripción y se detallará para cada caso si se trató de una prueba automatizada, una revisión de código o una comprobación manual. El uso de IA no determina por sí mismo el tipo de prueba.

Los commits `a70ab93`, `edc9d37`, `f0c723c`, `15bbb32`, `5283105` y `6eb4f1e` incluyen cambios de pruebas asociados a los incrementos. Este respaldo permite localizar pruebas durante el desarrollo. Para establecer resultados y fechas de ejecución se deben vincular las salidas, capturas o registros correspondientes.

Un integrante del equipo está consolidando los resultados en un informe por Sprint, a partir de las pruebas realizadas y las evidencias disponibles. Cada informe distinguirá su fecha de elaboración de la fecha de ejecución de las pruebas. Si esta última no puede recuperarse, se indicará como no registrada. Los casos se relacionarán con las historias o tareas correspondientes, evitando sumar como casos diferentes las repeticiones de una misma prueba sin explicar su propósito.

| Campo del registro de prueba | Contenido |
| --- | --- |
| Historia y criterio | Identificador y comportamiento que debía cumplirse |
| Caso | Entrada, precondiciones y acciones |
| Resultado esperado y obtenido | Comportamiento esperado y observación de la ejecución |
| Entorno y versión | Dispositivo o laboratorio y commit probado |
| Fecha y evidencia | Fecha de ejecución y enlace al resultado o captura |
| Error y repetición | Corrección aplicada y resultado de la nueva comprobación, si corresponde |

Las ejecuciones realizadas después del desarrollo se registrarán como validación final o regresión actual. Su resultado no acredita una ejecución durante un Sprint anterior.

## Información mínima pendiente

1. Vincular la evidencia de validación de Mercado Pago al cierre del Sprint 5 y las evidencias de pruebas, presentación y demo del Sprint 6. La disponibilidad de Mercado Pago al cierre del 16/10 fue confirmada por Sebastián; el commit del 17/10 corresponde a su registro posterior en Git. Las actividades generales del Sprint 6 y la existencia de un periodo sin actividad antes del cierre del 23/11 ya fueron aclaradas; faltan sus fechas y respaldos cuando estén disponibles.
2. Distribuir las sesiones compartidas del 25/09, 02/10 y 06/10 y precisar horas de transición si existen registros. El trabajo adicional fuera del horario acordado solo se incorporará si el equipo puede cuantificarlo.
3. Identificar el medio utilizado en las sesiones y relacionar los responsables y participantes con las tareas concretas. La coordinación inicial, la revisión conjunta y los aportes generales de los tres integrantes ya están descritos.
4. Detallar quién comprobaba cada funcionalidad, cómo intervenía la IA y qué escenarios manuales recuerdan.
5. Conciliar las estimaciones originales, elaboradas manualmente según dificultad, y vincular los informes de pruebas por Sprint que el equipo está consolidando. Su criterio de estimación ya está identificado; quedan pendientes los valores y resultados de cada registro.

## Documentos que se actualizarán con esta base

La planificación general `Planificación Sprints.md` incorpora las fechas confirmadas de los seis Sprints, la duración flexible, el acuerdo inicial de sesiones, la participación de los integrantes, el criterio manual de estimación y el cierre práctico de los incrementos. También recoge la consolidación de informes de pruebas y las actividades y el periodo sin actividad previos al cierre del Sprint 6. La capacidad se presenta como referencia retrospectiva de disponibilidad. Se mantiene la distinción entre la disponibilidad de Mercado Pago al cierre del Sprint 5 y la fecha de su commit. Las tablas originales de tareas, asignaciones y estimaciones se conservan para conciliar su alcance con los registros detallados.

Con esta organización general consolidada, el siguiente paso es conciliar el Sprint 1: relacionar historias y tareas, resolver las diferencias de puntos y cantidades de pruebas entre documentos e identificar responsables y participantes. Después se continuará con los demás Sprints. Con ese alcance se actualizarán fechas, estimaciones recuperables, estado de cierre y pruebas en los archivos correspondientes. Los registros reconstruidos conservarán esa identificación y los acuerdos actuales llevarán su fecha real.

Las correcciones técnicas del modelo de datos, arquitectura y criterios de aceptación pueden avanzar a partir del código; los datos de dedicación, ceremonias y decisiones históricas necesitan el aporte del equipo.
