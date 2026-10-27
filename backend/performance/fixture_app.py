"""Real API routes with a deterministic, network-free Supabase transport.

Import only from the dedicated performance container, never from app.main.
No real token, database, checkout or writable endpoint is available here.
"""

import asyncio
import json
import os
import re
from uuid import UUID

import httpx
from fastapi.responses import JSONResponse

from app.main import app
from app.services.supabase_auth import SupabaseAuthGateway, get_auth_gateway

CLIENT = "22222222-3333-4444-8555-666666666666"
WORKER = "11111111-2222-4333-8444-555555555555"
BOOKING = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb"
SERVICE = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
CATEGORY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
CONVERSATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
STAMP = "2026-10-01T12:00:00Z"
DELAY_MS = float(os.getenv("PERF_UPSTREAM_DELAY_MS", "10"))
if not 0 <= DELAY_MS <= 1000:
    raise ValueError("PERF_UPSTREAM_DELAY_MS debe estar entre 0 y 1000")

category = dict(id=CATEGORY, slug="cerrajeria", nombre="Cerrajería",
                descripcion="Servicios de demostración", requiere_certificacion=False,
                certificacion_requerida=None, orden=1)
service = dict(
    id=SERVICE, nombre="Apertura de puerta", descripcion="Servicio de demostración",
    precio_base=25000, duracion_estimada_minutos=60, modalidad="DOMICILIO",
    categoria_id=CATEGORY, categoria_slug=category["slug"], categoria_nombre=category["nombre"],
    categoria_descripcion=category["descripcion"], categoria_requiere_certificacion=False,
    categoria_certificacion_requerida=None, categoria_orden=1,
    trabajador_id=WORKER, trabajador_nombre="Trabajador de carga",
    comuna_id=CLIENT, comuna_nombre="Santiago", creado_en=STAMP, actualizado_en=STAMP,
)
booking = dict(
    id=BOOKING, servicio_id=SERVICE, cliente_id=CLIENT, trabajador_id=WORKER,
    servicio_nombre=service["nombre"], cliente_nombre="Cliente de carga", precio_base=25000,
    duracion_estimada_minutos=60, modalidad="DOMICILIO", inicio_en="2030-01-10T15:00:00Z",
    ubicacion_servicio="Dirección ficticia 123", estado="ACEPTADA", motivo_cancelacion=None,
    creado_en=STAMP, actualizado_en=STAMP,
)
services = [{**service, "id": SERVICE if i == 0 else str(UUID(int=1000 + i))} for i in range(100)]
bookings = [{**booking, "id": BOOKING if i == 0 else str(UUID(int=2000 + i))} for i in range(100)]
messages = [dict(id=str(UUID(int=3000 + i)), conversacion_id=CONVERSATION,
                 autor_id=CLIENT if i % 2 else WORKER, contenido=f"Mensaje de carga {i + 1}",
                 creado_en=STAMP, editado_en=None) for i in range(120)]


async def upstream(request: httpx.Request) -> httpx.Response:
    """Only explicitly supported read RPCs are accepted; unknown requests fail closed."""
    await asyncio.sleep(DELAY_MS / 1000)
    path = request.url.path
    params = request.url.params
    body = json.loads(request.content or b"{}")
    token = request.headers.get("Authorization", "")
    role = {"Bearer fixture-client": "CLIENTE", "Bearer fixture-worker": "TRABAJADOR"}.get(token)
    identity = CLIENT if role == "CLIENTE" else WORKER
    if path == "/auth/v1/user":
        return httpx.Response(200, json={"id": identity}) if role else httpx.Response(401)
    if path == "/rest/v1/usuarios" and role:
        return httpx.Response(200, json=[dict(id=identity, nombre="Usuario de carga",
            email="load@example.test", rol=role, activo=True, telefono=None,
            rut="12345678-5", creado_en=STAMP, actualizado_en=STAMP)])
    if path == "/rest/v1/categorias":
        return httpx.Response(200, json=[category])
    if path == "/rest/v1/rpc/buscar_servicios_catalogo":
        rows = services
        if body.get("p_servicio_id"):
            rows = [row for row in rows if row["id"] == body["p_servicio_id"]]
        if body.get("p_q"):
            rows = [row for row in rows if body["p_q"].lower() in row["nombre"].lower()]
        offset, limit = body["p_offset"], body["p_limit"]
        page = [{**row, "total_count": len(rows)} for row in rows[offset:offset + limit]]
        return httpx.Response(200, json=page)
    if not role:
        return httpx.Response(403, json={"code": "42501"})
    if path == "/rest/v1/solicitudes":
        rows = bookings
        if params.get("id"):
            rows = [row for row in rows if "eq." + row["id"] == params["id"]]
        if "COMPLETADA,CANCELADA,RECHAZADA" in params.get("and", ""):
            rows = []
        offset, limit = int(params.get("offset", 0)), int(params.get("limit", 100))
        return httpx.Response(200, json=rows[offset:offset + limit])
    if path == "/rest/v1/rpc/gestionar_chat_solicitud" and body.get("p_accion") == "LEER":
        if body.get("p_solicitud_id") != BOOKING:
            return httpx.Response(404, json={"code": "P0002"})
        offset, limit = body["p_offset"], body["p_limit"]
        page = list(reversed(messages))[offset:offset + limit]
        return httpx.Response(200, json=dict(solicitud_id=BOOKING, conversacion_id=CONVERSATION,
            contraparte_nombre="Participante de carga", servicio_nombre=service["nombre"],
            items=list(reversed(page)), limit=limit, offset=offset,
            has_more=offset + limit < len(messages)))
    if path == "/rest/v1/rpc/consultar_ganancias_trabajador" and role == "TRABAJADOR":
        month = body["p_mes"][:7]
        return httpx.Response(200, json=dict(mes=month, moneda="CLP", simulado=True,
            total_completado=25000, cantidad_completada=1, total_en_curso=0, cantidad_en_curso=0,
            dias=[dict(fecha=month + "-01", monto=25000)],
            items=[dict(solicitud_id=BOOKING, servicio_nombre=service["nombre"],
                        estado="COMPLETADA", monto=25000, fecha=STAMP, completada=True)]
                  if body["p_offset"] == 0 else [],
            limit=body["p_limit"], offset=body["p_offset"], has_more=False))
    return httpx.Response(500, json={"code": "FIXTURE_UNSUPPORTED"})


async def fixture_gateway():
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        yield SupabaseAuthGateway(client, "https://fixture.invalid", "fixture-only")


app.dependency_overrides[get_auth_gateway] = fixture_gateway


@app.middleware("http")
async def read_only_fixture(request, call_next):
    # Protect even against accidentally running a future write scenario here.
    if request.method != "GET":
        return JSONResponse({"detail": "Performance fixture is read-only"}, status_code=405)
    path = request.url.path
    allowed = path in {
        "/__performance", "/api/v1/health", "/api/v1/categorias", "/api/v1/servicios",
        "/api/v1/solicitudes", "/api/v1/trabajadores/me/ganancias",
    } or re.fullmatch(r"/api/v1/servicios/[\w-]+", path) or re.fullmatch(
        r"/api/v1/solicitudes/[\w-]+(?:/chat)?", path)
    if not allowed:
        return JSONResponse({"detail": "Endpoint outside performance fixture"}, status_code=404)
    return await call_next(request)


@app.get("/__performance")
async def marker():
    return {"mode": "isolated-read-only", "upstream_delay_ms": DELAY_MS,
            "services": len(services), "bookings": len(bookings), "messages": len(messages)}
