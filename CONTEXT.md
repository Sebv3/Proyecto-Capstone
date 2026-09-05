# CONTEXT.md - ServiMatch

> **Archivo de contexto completo para IA y nuevos integrantes del equipo.**
> Última actualización: Septiembre 2026

---

## 1. Descripción del Proyecto

**ServiMatch** es una aplicación móvil marketplace geolocalizado de servicios que conecta a personas que necesitan contratar un servicio con trabajadores independientes que desean ofrecer sus habilidades.

**Mercado objetivo:** Chile, iniciando en Santiago de Chile.

**Enfoque:** Servicios difíciles de encontrar o menos visibles (zapateros, oficios tradicionales) y servicios de alta demanda (gasfitería, electricidad, carpintería, jardinería, tecnología).

**Pilares del sistema:** Facilidad de uso, Confianza, Transparencia, Disponibilidad, Cercanía.

---

## 2. Problema que Resuelve

1. **Clientes:** Encontrar un trabajador confiable requiere recomendaciones informales, dificultando comparar alternativas, precios, disponibilidad y reputación.
2. **Trabajadores:** Dificultad para encontrar clientes y nuevas oportunidades laborales.

**La plataforma resuelve ambos problemas mediante:**
- Búsqueda y contratación centralizada
- Mayor visibilidad de trabajadores independientes
- Información clara antes de contratar
- Solicitud, comunicación y pago integrados
- Mecanismos de confianza (verificación, calificaciones, reseñas)

---

## 3. Actores del Sistema

| Actor | Descripción | Acciones principales |
|-------|-------------|---------------------|
| **Cliente** | Persona que necesita contratar un servicio | Buscar, consultar, solicitar, pagar, comunicarse y calificar |
| **Trabajador** | Independiente que ofrece sus habilidades | Publicar servicios, definir precios, gestionar disponibilidad, aceptar/rechazar, comunicarse y atender |
| **Administrador** | Gestor de la plataforma | Gestionar usuarios, categorías, verificaciones, reportes e incidencias |
| **Pasarela de pago** | Mercado Pago | Procesar transacciones y entregar resultado del pago |
| **Servicio de mapas** | Google Maps | Mapas, ubicación y funcionalidades geográficas |
| **Servicio de notificaciones** | Expo Notifications | Avisos asociados a solicitudes, mensajes y estados |

---

## 4. Stack Tecnológico

| Capa | Tecnología | Detalle |
|------|-----------|---------|
| **Frontend Mobile** | React Native + TypeScript | Aplicación móvil multiplataforma |
| **Navegación** | React Navigation | Native Stack & Bottom Tabs |
| **HTTP Client** | Axios | Consumo de endpoints |
| **Backend / API** | Python (FastAPI) | API REST asíncrona |
| **Servidor ASGI** | Uvicorn | Servidor de alto rendimiento |
| **HTTP Async Client** | httpx | Consumo de APIs externas (Expo, Mercado Pago) |
| **DB/Auth/Storage** | Supabase | PostgreSQL + Auth + Storage |
| **Validación** | Pydantic v2 | Esquemas DTO |
| **Pasarela de Pago** | Mercado Pago | Modo Sandbox/Pruebas (proyecto de título) |
| **Mapas** | react-native-maps + Google Maps | Mapa estático con pines, sin GPS en vivo |
| **Notificaciones** | Expo Notifications | Alertas push automáticas |
| **Entorno Backend** | Docker Compose | Desarrollo reproducible para todo el equipo |
| **Idioma** | Español | Solo español inicialmente |

---

## 5. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (RN + TS)                  │
│  Screens → Components → API Client (Axios)          │
│  Navigation (React Navigation)                      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────┐
│                BACKEND (FastAPI)                     │
│  Routers → Schemas (Pydantic) → Services            │
│  Core (Config + Supabase Client)                    │
│  Depends() para auth JWT                            │
└──────┬───────────────┬───────────────┬──────────────┘
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│  Supabase   │ │ Mercado Pago│ │ Google Maps │
│ (PostgreSQL │ │  (Sandbox)  │ │ (Geocoding) │
│  Auth/Store)│ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Flujo de datos:**
1. Cliente interactúa con la app móvil
2. App envía requests HTTP a FastAPI
3. FastAPI valida con Pydantic, ejecuta lógica de negocio
4. FastAPI consulta Supabase (DB/Auth/Storage)
5. FastAPI retorna respuesta JSON
6. App actualiza UI

---

## 6. Estructura del Proyecto

```
Proyecto ServiMatch contexto/
├── CONTEXT.md              ← Este archivo
├── Analisis.md             ← Documento original de definición
├── Contexto.md             ← Contexto del proyecto
├── RF.md                   ← Requerimientos funcionales (RF-001 a RF-032)
├── ReglasNegocio.md        ← Reglas de negocio (RN-001 a RN-034)
├── CasosUso.md             ← Casos de uso (CU-001 a CU-020)
├── ModeloDatos.md          ← Modelo de datos (14 entidades)
├── Pendientes.md           ← Decisiones y dudas resueltas
├── Diagramas/
│   ├── CasosUso.md         ← Diagramas de casos de uso Mermaid
│   ├── Secuencias.md       ← Diagramas de secuencia Mermaid
│   └── Clases.md           ← Diagrama de clases Mermaid
└── Codigo fuente (pendiente de crear)
    ├── mobile/
    │   ├── src/
    │   │   ├── api/
    │   │   ├── components/
    │   │   ├── navigation/
    │   │   ├── screens/
    │   │   ├── types/
    │   │   └── utils/
    │   ├── App.tsx
    │   └── package.json
    └── backend/
        ├── app/
        │   ├── core/
        │   ├── routers/
        │   ├── schemas/
        │   ├── services/
        │   └── main.py
        ├── requirements.txt
        └── .env.example
```

---

## 7. Modelo de Datos

### Entidades principales

| # | Entidad | Descripción |
|---|---------|-------------|
| 1 | **Usuario** | Cualquier persona registrada (id, email, nombre, rol, verificado) |
| 2 | **Trabajador** | Extiende Usuario (rut, fotos carnet, dirección, coordenadas, estado_verificacion) |
| 3 | **Certificacion** | Documentos de certificación del trabajador |
| 4 | **Categoria** | Categorías de servicios (electricidad, jardinería, etc.) |
| 5 | **Servicio** | Oferta del trabajador (nombre, precio, duración, a_domicilio) |
| 6 | **Disponibilidad** | Horarios del trabajador por servicio |
| 7 | **Solicitud** | Pedido del cliente al trabajador (fecha, hora, ubicación, estado) |
| 8 | **Pago** | Registro de pago (tarifa_base, comision=15%, monto_total) |
| 9 | **ConfirmacionServicio** | Código de confirmación (expira en 24h) |
| 10 | **Calificacion** | Puntuación (1-5) y reseña del servicio |
| 11 | **Mensaje** | Chat entre cliente y trabajador |
| 12 | **Notificacion** | Notificaciones push enviadas |
| 13 | **SoporteTicket** | Tickets para cambio de dirección y otros |
| 14 | **Disputa** | Reportes de mal servicio con evidencia |

### Estados de la Solicitud

```
PENDIENTE → ACEPTADA → PAGADA → EN_CAMINO → EN_CURSO → COMPLETADA
                  ↓                    ↓            ↓
             RECHAZADA            EN_CURSO      LISTO (taller)
                  ↓                    ↓            ↓
              CANCELADA          COMPLETADA    COMPLETADA
```

**Flujo a domicilio:** PAGADA → EN_CAMINO → EN_CURSO → COMPLETADA
**Flujo en taller:** PAGADA → EN_CURSO → LISTO → COMPLETADA

### Fórmula de Pago

```
Total que paga el cliente = Tarifa base + (Tarifa base × 15%)
Ingreso de la plataforma  = Tarifa base × 15%
Ingreso del trabajador    = Tarifa base (impuestos los declara el trabajador)
```

---

## 8. Reglas de Negocio

### Registro y Perfiles
- **RN-001:** Rol exclusivo al registrarse (Cliente O Trabajador)
- **RN-002:** Cliente puede solicitar cambio a Trabajador (con verificación)
- **RN-003:** Trabajador debe verificar identidad (RUT, foto carnet) antes de publicar
- **RN-004:** Máximo **5 servicios activos** por trabajador
- **RN-029:** Dirección base registrada con geocoding. Cambio vía ticket de soporte

### Servicios
- **RN-005:** Cada servicio pertenece a una categoría
- **RN-006:** El trabajador define el precio
- **RN-007:** Algunos servicios requieren certificaciones validadas por admin
- **RN-018:** Servicios de alta y baja demanda
- **RN-021:** Trabajador define duración estimada del servicio

### Solicitudes
- **RN-008:** Solicitud debe indicar servicio, cliente, fecha y horario
- **RN-009:** Servicios a domicilio requieren ubicación del cliente
- **RN-010:** Trabajador debe aceptar para confirmar
- **RN-024:** Auto-rechazo de conflictos de horario

### Estados y Flujos
- **RN-019:** "En Camino" solo para domicilio (trabajador → cliente)
- **RN-020:** "Listo" solo para taller (trabajo puede llevar días)

### Pagos
- **RN-011:** Pago asociado a solicitud
- **RN-012:** Comisión 15% sobre tarifa base
- **RN-016:** Pago anticipado, liberación post-servicio
- **RN-017:** Confirmación con código (24h expiración)

### Cancelación
- **RN-022:** Cancelación cliente: gratuita (10 min) / tardía (10% penalización)
- **RN-023:** Cancelación trabajador: reembolso 100% + bloqueo 2h

### Calificación y Confianza
- **RN-013:** Calificación post-servicio
- **RN-028:** Moderación: filtro automático + sistema de reporte
- **RN-034:** Disputa: reporte con evidencia → admin resuelve

### Infraestructura
- **RN-014:** Ubicación registrada, no GPS en tiempo real
- **RN-015:** Protección de datos personales
- **RN-025:** Código expira en 24 horas
- **RN-026:** Historial permanente sin límite
- **RN-027:** Soporte técnico manual por admin
- **RN-029:** Geolocalización con dirección base fija
- **RN-030:** Solo español
- **RN-031:** Notificaciones por email además de push
- **RN-032:** Búsqueda avanzada con filtros múltiples
- **RN-033:** Certificaciones validadas manualmente por admin

---

## 9. Flujos Principales

### Flujo del Cliente
1. Registro → Seleccionar "Cliente"
2. Buscar servicios (categoría, palabra clave, mapa)
3. Ver detalle (descripción, precio, calificaciones, disponibilidad)
4. Agendar (fecha, horario, ubicación si aplica)
5. Enviar solicitud
6. Coordinar por chat
7. Pagar (tarifa base + 15%)
8. **Si domicilio:** Esperar al trabajador → Confirmar con código
9. **Si taller:** Dejar objeto → Esperar notificación "Listo" → Recoger + código
10. Calificar y reseñar

### Flujo del Trabajador (Domicilio)
1. Registro → Verificación de identidad → Aprobación
2. Crear servicio (categoría, precio, duración, disponibilidad)
3. Recibir solicitud → Aceptar
4. Presionar "En camino" → Llegar → Presionar "Comenzar"
5. Realizar servicio
6. Compartir código de confirmación con cliente
7. Recibir pago (tarifa base)

### Flujo del Trabajador (Taller)
1. Registro → Verificación de identidad → Aprobación
2. Crear servicio
3. Recibir solicitud → Aceptar
4. Recibir objeto del cliente → Presionar "Comenzar"
5. Realizar trabajo (puede ser días)
6. Presionar "Trabajo listo" → Notificar al cliente
7. Cliente recoge → Ingresa código → Pago liberado

---

## 10. Convenciones del Proyecto

### Nomenclatura de Archivos
| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Componentes React Native | `PascalCase.tsx` | `ServiceCard.tsx` |
| Pantallas | `PascalCaseScreen.tsx` | `HomeScreen.tsx` |
| Servicios/Utils | `camelCase.ts` | `formatCurrency.ts` |
| Modelos/Types | `PascalCase.ts` | `Service.ts`, `User.ts` |
| Backend Routers | `snake_case.py` | `services.py`, `bookings.py` |
| Backend Schemas | `snake_case.py` | `service_schema.py` |
| Backend Services | `snake_case.py` | `payment_service.py` |

### Nomenclatura de Código
| Contexto | Convención | Ejemplo |
|----------|-----------|---------|
| Variables/Funciones | `camelCase` | `getServices()`, `formatPrice()` |
| Clases/Componentes | `PascalCase` | `ServiceCard`, `BookingService` |
| Constantes | `UPPER_SNAKE_CASE` | `API_BASE_URL`, `MAX_SERVICES` |
| Enums | `PascalCase` | `ServiceStatus`, `UserRole` |

### Base de Datos
| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Tablas | `snake_case` (plural) | `usuarios`, `servicios`, `solicitudes` |
| Columnas | `snake_case` | `fecha_servicio`, `monto_total` |
| Primary Keys | `id` (UUID) | `id` |
| Foreign Keys | `{tabla}_id` | `servicio_id`, `trabajador_id` |

### API REST
| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Endpoints | `/api/v1/{recurso}` | `/api/v1/servicios` |
| Métodos | GET, POST, PUT, DELETE | `GET /api/v1/solicitudes/{id}` |
| Respuestas | JSON con `data` y `message` | `{ "data": {...}, "message": "OK" }` |

### Git
| Elemento | Convención |
|----------|-----------|
| Ramas | `feature/`, `fix/`, `chore/` |
| Commits | Descripción en inglés, corta |
| Ejemplo | `feat: add service creation endpoint` |

### Imports (orden sugerido)
```typescript
// 1. Librerías externas
import React from 'react';
import { View, Text } from 'react-native';

// 2. Componentes internos
import Button from '../components/Button';

// 3. Servicios/Utils
import { formatCurrency } from '../utils/formatCurrency';

// 4. Types
import { Service } from '../types/Service';
```

---

## 11. Comandos Útiles

### Frontend (React Native)
```bash
# Instalación
cd mobile && npm install

# Ejecución
npx react-native run-android
npx react-native run-ios

# Limpiar caché
npx react-native start --reset-cache
```

### Backend (FastAPI)
```bash
# Instalación
cd backend && pip install -r requirements.txt

# Ejecución
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Documentación API
# http://localhost:8000/docs
```

### Base de Datos (Supabase)
```bash
# Las migraciones se manejan desde el dashboard de Supabase
# URL: https://supabase.com/dashboard
```

---

## 12. Estado Actual del Proyecto

| Fase | Estado |
|------|--------|
| Análisis Funcional | ✅ Completo (32 RF, 34 RN, 20 CU, 14 entidades) |
| Diseño de Base de Datos | ✅ Completo |
| Diagramas | ✅ Completo (Casos de uso, Secuencias, Clases) |
| Contexto del Proyecto | ✅ Completo |
| Definición del MVP | ✅ Completo (`MVP.md`) |
| Diseño UI/UX | ⏳ Pendiente |
| Desarrollo Frontend | ⏳ Pendiente |
| Desarrollo Backend | ⏳ Pendiente |
| Integración APIs | ⏳ Pendiente |
| Testing | ⏳ Pendiente |
| Despliegue | ⏳ Pendiente |

---

## 13. Documentación Relacionada

| Archivo | Contenido | Líneas |
|---------|-----------|--------|
| `Analisis.md` | Documento original de definición del proyecto | 279 |
| `Contexto.md` | Objetivo, actores, procesos, restricciones | 94 |
| `RF.md` | 32 requerimientos funcionales (RF-001 a RF-032) | 250+ |
| `ReglasNegocio.md` | 34 reglas de negocio (RN-001 a RN-034) | 185 |
| `CasosUso.md` | 20 casos de uso con flujos detallados | 400+ |
| `ModeloDatos.md` | 14 entidades con atributos y relaciones | 332 |
| `Pendientes.md` | 18 decisiones resueltas | 168 |
| `MVP.md` | Alcance, stack, criterios de aceptación y etapas del MVP | - |
| `Diagramas/CasosUso.md` | Diagramas Mermaid de actores y flujos | 155 |
| `Diagramas/Secuencias.md` | 12 diagramas de secuencia | 350+ |
| `Diagramas/Clases.md` | Diagrama de clases y paquetes | 342 |

---

## 14. Notas para IA

Al trabajar en este proyecto, ten en cuenta:

1. **Proyecto de título:** Es un proyecto académico, no de producción. Mercado Pago queda en Sandbox.
2. **Mercado chileno:** Precios en CLP, RUT, comunas de Santiago.
3. **Dos flujos distintos:** Domicilio (EN_CAMINO) vs Taller (LISTO). Siempre preguntar `a_domicilio`.
4. **Código de confirmación:** Elemento central del flujo de pago. 24h de expiración.
5. **Comisión 15%:** El trabajador recibe la tarifa base. Los impuestos son responsabilidad del trabajador.
6. **Sin GPS en tiempo real:** La ubicación es estática, registrada por el usuario.
7. **Moderación:** Reseñas tienen filtro automático + sistema de reporte.
8. **Admin manual:** Verificaciones, certificaciones, disputas y soporte son gestionados manualmente por el administrador.
9. **Alcance del MVP:** Consultar `MVP.md` antes de implementar una funcionalidad. Lo que figure fuera de alcance se posterga salvo decisión explícita del equipo.
10. **Base móvil:** El MVP utilizará Expo con React Native y TypeScript, manteniendo React Navigation.
