import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.health import HealthResponse


def _allowed_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:8081")
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


app = FastAPI(
    title="ServiMatch API",
    description="API REST del marketplace de servicios ServiMatch.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health", response_model=HealthResponse, tags=["Sistema"])
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="servimatch-api", version="0.1.0")
