from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.schemas.booking import BookingResponse


class PaymentAmounts(BaseModel):
    tarifa_base: int = Field(gt=0)
    comision: int = Field(ge=0)
    monto_total: int = Field(gt=0)
    moneda: Literal["CLP"]
    simulado: Literal[True]

    @model_validator(mode="after")
    def consistent_amounts(self) -> Self:
        # Positive CLP amounts: round half up, exactly as PostgreSQL numeric round.
        if self.comision != (self.tarifa_base * 15 + 50) // 100:
            raise ValueError("Comisión inválida")
        if self.monto_total != self.tarifa_base + self.comision:
            raise ValueError("Total inválido")
        return self


class PaymentResponse(PaymentAmounts):
    proveedor: Literal["SIMULADO", "MERCADO_PAGO_TEST"] = "SIMULADO"
    proveedor_pago_id: str | None = None
    id: UUID
    solicitud_id: UUID
    cliente_id: UUID
    trabajador_id: UUID
    estado: Literal["APROBADO"]
    creado_en: AwareDatetime


class PaymentSummary(PaymentAmounts):
    pago: PaymentResponse | None

    @model_validator(mode="after")
    def consistent_payment(self) -> Self:
        if self.pago and (self.pago.tarifa_base != self.tarifa_base
                         or self.pago.comision != self.comision
                         or self.pago.monto_total != self.monto_total):
            raise ValueError("El comprobante no coincide con el desglose")
        return self


class PaymentResult(BaseModel):
    pago: PaymentResponse
    solicitud: BookingResponse

    @model_validator(mode="after")
    def consistent_booking(self) -> Self:
        if (self.pago.solicitud_id != self.solicitud.id
            or self.pago.cliente_id != self.solicitud.cliente_id
            or self.pago.trabajador_id != self.solicitud.trabajador_id
            or self.pago.tarifa_base != self.solicitud.precio_base
            or self.solicitud.estado not in (
                "PAGADA", "EN_CAMINO", "EN_CURSO", "LISTO", "COMPLETADA"
            )):
            raise ValueError("El pago no coincide con la solicitud")
        return self


class SimulatedPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
