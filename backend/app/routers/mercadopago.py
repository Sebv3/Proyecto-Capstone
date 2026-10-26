import json
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import AwareDatetime, BaseModel

from app.core.security import AuthGateway, BearerToken
from app.routers.bookings import CurrentUser, _error, _parse, _read, _token
from app.schemas.payment import SimulatedPaymentRequest
from app.schemas.user import UserRole
from app.services.mercadopago import (
    MercadoPago,
    checkout_url,
    enabled,
    get_mercadopago,
    get_payment_store,
    public_url,
    reconcile,
    store_rpc,
    validate_signature,
)
from app.services.supabase_auth import SupabaseAuthGateway

router = APIRouter(prefix="/api/v1", tags=["Mercado Pago de prueba"])
MP = Annotated[MercadoPago, Depends(get_mercadopago)]
Store = Annotated[SupabaseAuthGateway, Depends(get_payment_store)]


class Checkout(BaseModel):
    id: UUID
    solicitud_id: UUID
    estado: Literal["CREANDO", "LISTO", "PENDIENTE", "RECHAZADO", "APROBADO", "REVISION"]
    checkout_url: str | None = None
    expira_en: AwareDatetime


async def read_checkout(gateway, token, booking_id):
    response = await gateway.request(
        "GET",
        "/rest/v1/checkout_mercadopago",
        access_token=token,
        params={"solicitud_id": f"eq.{booking_id}", "select": "*", "limit": "1"},
    )
    if response.status_code >= 400:
        raise HTTPException(503, "Falta habilitar Mercado Pago en la base de datos")
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError
        return rows[0] if rows else None
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de checkout inválida") from exc


@router.get("/pagos/configuracion")
async def payment_configuration():
    return {"modo": "MERCADO_PAGO_TEST" if enabled() else "DESHABILITADO"}


@router.get("/solicitudes/{booking_id}/pago/mercadopago", response_model=Checkout | None)
async def checkout_status(
    booking_id: UUID, user: CurrentUser, credentials: BearerToken, gateway: AuthGateway
):
    await _read(booking_id, user, gateway, _token(credentials))
    return await read_checkout(gateway, _token(credentials), booking_id)


def preference_start(checkout: dict) -> datetime:
    # The app host may be minutes ahead of MP. Use the database-created snapshot,
    # with a margin, rather than making checkout availability depend on that clock.
    try:
        created = datetime.fromisoformat(checkout["creado_en"].replace("Z", "+00:00"))
        if created.tzinfo is None:
            raise ValueError
        return created - timedelta(minutes=5)
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(502, "Fecha de checkout inválida") from exc


async def repair_preference_window(mp, checkout, preference, seller):
    bound_preference = checkout.get("preferencia_id")
    if (
        preference.get("external_reference") != str(checkout["id"])
        or str(preference.get("collector_id")) != seller
        or (bound_preference and preference.get("id") != bound_preference)
    ):
        raise HTTPException(502, "La preferencia no coincide con el checkout")
    start = preference.get("expiration_date_from")
    if start:
        try:
            existing = datetime.fromisoformat(start.replace("Z", "+00:00"))
            if existing.tzinfo is None:
                raise ValueError
        except (ValueError, TypeError, AttributeError) as exc:
            raise HTTPException(502, "Fecha de preferencia inválida") from exc
        target = preference_start(checkout)
        if existing > target + timedelta(seconds=1):
            return await mp.request(
                "PUT",
                f"/checkout/preferences/{preference['id']}",
                json={
                    "expires": True,
                    "expiration_date_from": target.isoformat(),
                    "expiration_date_to": checkout["expira_en"],
                },
            )
    return preference


async def save_preference(store, checkout, preference, seller):
    identifier = preference.get("id")
    if (
        not isinstance(identifier, str)
        or not identifier
        or preference.get("external_reference") != str(checkout["id"])
        or str(preference.get("collector_id")) != seller
    ):
        raise HTTPException(502, "La preferencia no coincide con el checkout")
    url = checkout_url(preference.get("init_point", ""))
    return await store_rpc(
        store,
        "guardar_preferencia_mercadopago",
        {
            "p_checkout_id": str(checkout["id"]),
            "p_preferencia_id": identifier,
            "p_checkout_url": url,
            "p_collector_id": seller,
        },
    )


@router.post("/solicitudes/{booking_id}/pago/mercadopago", response_model=Checkout)
async def create_checkout(
    booking_id: UUID,
    body: SimulatedPaymentRequest,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
    mp: MP,
    store: Store,
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(403, "Solo el cliente puede iniciar el pago")
    if not enabled():
        raise HTTPException(503, "Mercado Pago de prueba no está habilitado")
    base = public_url()
    if not os.getenv("MERCADO_PAGO_WEBHOOK_SECRET", "").strip():
        raise HTTPException(503, "Falta configurar el secreto de notificaciones")
    # Validate the server's seller before creating even a preference.
    seller = await mp.test_seller()
    response = await gateway.request(
        "POST",
        "/rest/v1/rpc/iniciar_checkout_mercadopago",
        access_token=_token(credentials),
        json={"p_solicitud_id": str(booking_id)},
    )
    _error(response)
    try:
        value = response.json()
        checkout = value["checkout"]
        parsed = _parse(Checkout, checkout)
        if (
            parsed.solicitud_id != booking_id
            or checkout["cliente_id"] != str(user.id)
            or type(value["creado"]) is not bool
        ):
            raise ValueError
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(502, "Respuesta de checkout inválida") from exc
    if checkout.get("checkout_url"):
        checkout_url(checkout["checkout_url"])
        preference = await mp.request("GET", f"/checkout/preferences/{checkout['preferencia_id']}")
        await repair_preference_window(mp, checkout, preference, seller)
        return checkout
    if not value["creado"]:
        # Never POST another preference after a timeout. Recover the original by reference.
        created = datetime.fromisoformat(checkout["creado_en"].replace("Z", "+00:00"))
        if created > datetime.now(UTC) - timedelta(seconds=30):
            raise HTTPException(
                409, "El checkout se está preparando. Actualiza antes de reintentar"
            )
        search = await mp.request(
            "GET",
            "/checkout/preferences/search",
            params={"external_reference": str(parsed.id), "limit": 2},
        )
        elements = search.get("elements", [])
        if not isinstance(elements, list) or len(elements) != 1:
            raise HTTPException(
                409, "No se confirmó el checkout. Requiere revisión antes de crear otro"
            )
        preference = await mp.request("GET", f"/checkout/preferences/{elements[0]['id']}")
        preference = await repair_preference_window(mp, checkout, preference, seller)
    else:
        preference = await mp.request(
            "POST",
            "/checkout/preferences",
            json={
                "items": [
                    {
                        "id": str(parsed.id),
                        "title": "ServiMatch · " + checkout["servicio_nombre"],
                        "quantity": 1,
                        "currency_id": "CLP",
                        "unit_price": checkout["monto_total"],
                    }
                ],
                "external_reference": str(parsed.id),
                "notification_url": base + "/api/v1/pagos/mercadopago/webhook?source_news=webhooks",
                "back_urls": {
                    key: base + "/api/v1/pagos/mercadopago/retorno"
                    for key in ("success", "failure", "pending")
                },
                "auto_return": "approved",
                "expires": True,
                "expiration_date_from": preference_start(checkout).isoformat(),
                "expiration_date_to": parsed.expira_en.isoformat(),
            },
        )
    return await save_preference(store, checkout, preference, seller)


@router.post(
    "/solicitudes/{booking_id}/pago/mercadopago/sincronizar", response_model=Checkout | None
)
async def sync_checkout(
    booking_id: UUID,
    body: SimulatedPaymentRequest,
    user: CurrentUser,
    credentials: BearerToken,
    gateway: AuthGateway,
    mp: MP,
    store: Store,
):
    await _read(booking_id, user, gateway, _token(credentials))
    checkout = await read_checkout(gateway, _token(credentials), booking_id)
    if not checkout or not checkout.get("preferencia_id"):
        return checkout
    seller = await mp.test_seller()
    offset = 0
    while True:
        search = await mp.request(
            "GET",
            "/v1/payments/search",
            params={
                "external_reference": checkout["id"],
                "sort": "date_created",
                "criteria": "asc",
                "limit": 50,
                "offset": offset,
            },
        )
        items = search.get("results")
        if not isinstance(items, list) or not isinstance(search.get("paging"), dict):
            raise HTTPException(502, "Respuesta de pagos inválida")
        for item in items:
            identifier = str(item.get("id", ""))
            if not identifier.isdecimal():
                raise HTTPException(502, "Respuesta de pagos inválida")
            payment = await mp.request("GET", f"/v1/payments/{identifier}")
            if str(payment.get("id")) != identifier:
                raise HTTPException(502, "Respuesta de pago inválida")
            await reconcile(store, mp, payment, seller, expected=checkout["id"])
        offset += len(items)
        if offset >= search["paging"].get("total", 0):
            break
        if not items or offset >= 500:
            raise HTTPException(502, "La conciliación requiere revisión por cantidad de intentos")
    return await read_checkout(gateway, _token(credentials), booking_id)


@router.post("/pagos/mercadopago/webhook")
async def webhook(request: Request, mp: MP, store: Store):
    # Signatures bind the URL data.id. Never act on an unsigned body or arbitrary resource URL.
    ids = request.query_params.getlist("data.id")
    if len(ids) != 1:
        raise HTTPException(401, "Notificación no válida")
    identifier = ids[0]
    validate_signature(
        identifier, request.headers.get("x-request-id", ""), request.headers.get("x-signature", "")
    )
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 16384:
            raise HTTPException(413, "Notificación demasiado grande")
    try:
        body = json.loads(raw) if raw else {}
        if not isinstance(body, dict):
            raise ValueError
        if body.get("data", {}).get("id") is not None and str(body["data"]["id"]) != identifier:
            raise ValueError
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(400, "Notificación no válida") from exc
    topic = request.query_params.get("type", body.get("type"))
    if topic != "payment":
        return {"ok": True, "ignorado": True}
    seller = await mp.test_seller()
    try:
        payment = await mp.request("GET", f"/v1/payments/{identifier}")
    except HTTPException as exc:
        # The dashboard simulator uses a fictitious ID. Never invent a paid booking for it.
        if exc.status_code == 404:
            return {"ok": True, "ignorado": True}
        raise
    if str(payment.get("id")) != identifier:
        raise HTTPException(422, "Pago no coincide con la notificación")
    try:
        result = await reconcile(store, mp, payment, seller)
    except HTTPException as exc:
        if exc.status_code == 404:  # Payment belongs to another app/reference, not ServiMatch.
            return {"ok": True, "ignorado": True}
        raise
    return {"ok": True, "estado": result["estado"]}


@router.get("/pagos/mercadopago/retorno", response_class=HTMLResponse)
async def checkout_return():
    # Redirect query parameters are untrusted and never change booking/payment state.
    return HTMLResponse(
        """<!doctype html><html lang="es"><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Volver a ServiMatch</title>
        <body style="font-family:system-ui;padding:32px;background:#f3f6f4;color:#162b22">
        <h1>Vuelve a ServiMatch</h1><p>Ya puedes cerrar esta página y regresar a la aplicación.</p>
        <p>ServiMatch verificará el resultado con Mercado Pago antes de confirmar tu pago.</p>
        <p>Estás utilizando el ambiente de pruebas.</p></body></html>""",
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
    )
