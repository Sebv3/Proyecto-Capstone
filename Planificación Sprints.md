### Sprint 1 — Docker + Autenticación (Sem 1-2)
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

### Sprint 2 — Perfiles + Verificación (Sem 3-4)
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

### Sprint 3 — Catálogo + Publicación (Sem 5-6)
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

### Sprint 4 — Agendamiento + Estados (Sem 7-8)
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

### Sprint 5 — Chat + Pagos + Reseñas (Sem 9-10)
**Objetivo:** Comunicación, pago simulado y calificaciones

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

### Sprint 6 — Pulido + Demo Final (Sem 11-12)
**Objetivo:** Preparar presentación del proyecto de título

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

## 6. Resumen de Sprints

| Sprint    | Semanas        | Enfoque                                           |
| --------- | -------------- | ------------------------------------------------- |
| 1         | 1-2            | Docker + Auth + Tests                             |
| 2         | 3-4            | Perfiles + Verificación + Tests                   |
| 3         | 5-6            | Catálogo + Publicación + Mapa + Tests             |
| 4         | 7-8            | Agendamiento + Estados + Tests                    |
| 5         | 9-10           | Chat + Pagos + Reseñas + Tests                    |
| 6         | 11-12          | Pulido + Tests Rendimiento/Seguridad + Demo Final |
| **Total** | **12 semanas** | **MVP completo con pruebas**                      |