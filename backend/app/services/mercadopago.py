"""Checkout Pro Preferences API. All operations are restricted to a Chilean test seller."""

import hashlib
import hmac
import os
import re
from collections.abc import AsyncIterator
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.services.supabase_auth import SupabaseAuthGateway


def public_url() -> str:
    value = os.getenv("MERCADO_PAGO_PUBLIC_URL", "").strip().rstrip("/")
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
    ):
        raise HTTPException(503, "Configura la URL HTTPS pública de Mercado Pago")
    return value


def checkout_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in ("www.mercadopago.cl", "www.mercadopago.com")
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise HTTPException(502, "La dirección del checkout no es válida")
    return value


def enabled() -> bool:
    return os.getenv("MERCADO_PAGO_ENABLED", "false").lower() == "true"


def validate_signature(data_id: str, request_id: str, signature: str) -> None:
    secret = os.getenv("MERCADO_PAGO_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise HTTPException(503, "Falta configurar el secreto de notificaciones")
    if not re.fullmatch(r"[0-9]{1,30}", data_id) or not re.fullmatch(r"[\w-]{1,150}", request_id):
        raise HTTPException(401, "Notificación no válida")
    values = {}
    for part in signature.split(","):
        key, _, value = part.strip().partition("=")
        if key in values:
            raise HTTPException(401, "Notificación no válida")
        values[key] = value
    ts, digest = values.get("ts", ""), values.get("v1", "")
    if not re.fullmatch(r"[0-9]{1,20}", ts) or not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
        raise HTTPException(401, "Notificación no válida")
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, digest.lower()):
        raise HTTPException(401, "Notificación no válida")
    # Retries can arrive much later. Authoritative reads + transactional deduplication
    # make replay harmless; do not discard legitimate retries solely on timestamp age.


class MercadoPago:
    def __init__(self, client: httpx.AsyncClient, token: str):
        self.client, self.token = client, token

    async def request(self, method: str, path: str, **kwargs):
        try:
            response = await self.client.request(
                method,
                "https://api.mercadopago.com" + path,
                headers={"Authorization": f"Bearer {self.token}"},
                **kwargs,
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                502, "Mercado Pago no respondió. Actualiza antes de reintentar"
            ) from exc
        if response.status_code == 404:
            raise HTTPException(404, "Operación de Mercado Pago no encontrada")
        if response.status_code in (401, 403):
            raise HTTPException(503, "Revisa las credenciales de prueba de Mercado Pago")
        if response.status_code >= 400:
            raise HTTPException(502, "Mercado Pago no pudo procesar la operación")
        try:
            value = response.json()
            if not isinstance(value, dict):
                raise ValueError
            return value
        except ValueError as exc:
            raise HTTPException(502, "Respuesta de Mercado Pago inválida") from exc

    async def test_seller(self) -> str:
        account = await self.request("GET", "/users/me")
        identifier = str(account.get("id", ""))
        if (
            account.get("site_id") != "MLC"
            or "test_user" not in account.get("tags", [])
            or not identifier.isdecimal()
        ):
            raise HTTPException(503, "Solo se permite un vendedor de prueba de Chile")
        return identifier


async def get_mercadopago() -> AsyncIterator[MercadoPago]:
    token = os.getenv("MERCADO_PAGO_ACCESS_TOKEN", "").strip()
    if not token:
        raise HTTPException(503, "Falta configurar Mercado Pago de prueba")
    async with httpx.AsyncClient(timeout=20) as client:
        yield MercadoPago(client, token)


async def get_payment_store() -> AsyncIterator[SupabaseAuthGateway]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not key or not url:
        raise HTTPException(503, "Falta configurar la persistencia de pagos")
    headers = {"Authorization": f"Bearer {key}"} if key.startswith("eyJ") else {}
    async with httpx.AsyncClient(timeout=10, headers=headers) as client:
        yield SupabaseAuthGateway(client, url, key)


async def store_rpc(store, name: str, payload: dict):
    response = await store.request("POST", f"/rest/v1/rpc/{name}", json=payload)
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        status, message = {
            "PGRST202": (503, "Falta aplicar la migración de Mercado Pago"),
            "P0002": (404, "Checkout no encontrado"),
            "PT409": (409, "El pago requiere actualizar su estado"),
            "22023": (422, "El pago no coincide con la solicitud de prueba"),
        }.get(code, (502, "No se pudo registrar el resultado del pago"))
        raise HTTPException(status, message)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Respuesta de pago inválida") from exc


async def verify_test_payment(mp: MercadoPago, payment: dict, seller: str) -> None:
    mode = payment.get("live_mode")
    if mode is False:
        return
    if mode is not True:
        raise HTTPException(422, "Entorno de pago no válido")
    # Checkout Pro with fictitious users can report live_mode=true. Seller identity
    # was verified through /users/me; additionally verify MP's actual payer account,
    # not just a self-reported webhook flag or an email supplied by our client.
    payer = payment.get("payer") or {}
    identifier = str(payer.get("id", ""))
    email = str(payer.get("email", "")).lower()
    if (
        not re.fullmatch(r"[0-9]{1,30}", identifier)
        or identifier == seller
        or not re.fullmatch(r"test_user_[0-9]+@testuser\.com", email)
    ):
        raise HTTPException(422, "El comprador debe ser una cuenta de prueba de Mercado Pago")
    try:
        account = await mp.request("GET", f"/users/{identifier}")
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(422, "No se pudo verificar el comprador de prueba") from exc
        raise
    # Guest checkout creates an @<digits> profile even when using a fictitious
    # buyer email. Verify that profile through MP, together with the test seller
    # and reserved test email above; a normal account cannot use this exception.
    nickname = str(account.get("nickname", "")).upper()
    test_account = bool(re.fullmatch(r"TESTUSER[0-9]+", nickname))
    test_guest = account.get("user_type") == "guest" and bool(
        re.fullmatch(r"@[0-9]+", nickname)
    )
    if (
        str(account.get("id")) != identifier
        or account.get("site_id") != "MLC"
        or not (test_account or test_guest)
    ):
        raise HTTPException(422, "El comprador no corresponde a una cuenta de prueba chilena")


async def reconcile(store, mp: MercadoPago, payment: dict, seller: str, expected=None):
    from uuid import UUID

    try:
        reference = str(UUID(payment["external_reference"]))
        identifier = str(payment["id"])
        amount = Decimal(str(payment["transaction_amount"]))
        changed = datetime.fromisoformat(payment["date_last_updated"].replace("Z", "+00:00"))
        approved = payment.get("date_approved")
        if approved:
            approved = datetime.fromisoformat(approved.replace("Z", "+00:00"))
        if (
            not identifier.isdecimal()
            or not amount.is_finite()
            or changed.tzinfo is None
            or (approved and approved.tzinfo is None)
            or str(payment["collector_id"]) != seller
            or payment.get("currency_id") != "CLP"
            or (expected and reference != expected)
        ):
            raise ValueError
    except (KeyError, ValueError, TypeError, AttributeError, InvalidOperation) as exc:
        raise HTTPException(422, "El pago no corresponde al checkout de prueba") from exc
    await verify_test_payment(mp, payment, seller)
    return await store_rpc(
        store,
        "procesar_pago_mercadopago",
        {
            "p_checkout_id": reference,
            "p_pago_id": identifier,
            "p_estado": payment.get("status"),
            "p_monto": str(amount),
            "p_moneda": payment["currency_id"],
            "p_collector_id": seller,
            # Normalized business environment after verifying the provider's test
            # actors. The SQL RPC remains restricted to simulated receipts.
            "p_live_mode": False,
            "p_aprobado_en": approved.isoformat() if approved else None,
            "p_actualizado_en": changed.isoformat(),
        },
    )
