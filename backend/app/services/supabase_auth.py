import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import HTTPException


class SupabaseAuthGateway:
    """Send stateless requests to Supabase Auth and PostgREST."""

    def __init__(self, client: httpx.AsyncClient, url: str, publishable_key: str) -> None:
        self.client = client
        self.url = url
        self.publishable_key = publishable_key

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
        access_token: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        headers = {"apikey": self.publishable_key}
        if access_token is not None:
            headers["Authorization"] = f"Bearer {access_token}"
        if extra_headers is not None:
            headers.update(extra_headers)

        try:
            return await self.client.request(
                method,
                f"{self.url}{path}",
                headers=headers,
                json=json,
                params=params,
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail="Supabase no está disponible") from exc


async def get_auth_gateway() -> AsyncIterator[SupabaseAuthGateway]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Supabase no está configurado")

    async with httpx.AsyncClient(timeout=10.0) as client:
        yield SupabaseAuthGateway(client, url, key)
