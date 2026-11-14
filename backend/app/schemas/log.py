"""Daily log and symptom schemas (SPEC Appendix A).

The numeric ranges are the same physiological sanity bounds the frontend
enforces in frontend/config/measurements.ts (HR 20-250, BP 50-260 / 30-160,
glucose 20-600, temperature 30-43, SpO2 50-100, sleep 0-24, 1-5 scales,
weight 20-250, exercise 0-600, water 0-10000, radiation >= 0). They reject
impossible values; they are not the clinical green/yellow/red bands.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.constants import SYMPTOM_IDS
from app.schemas.common import OwnedOut, UtcDatetime


class DailyLogIn(BaseModel):
    id: UUID
    # Omitted = the logged-in astronaut. Anything else must be yourself.
    astronaut_id: UUID | None = None
    log_date: date
    mission_day: int | None = Field(None, ge=1)
    heart_rate: int | None = Field(None, ge=20, le=250)
    bp_systolic: int | None = Field(None, ge=50, le=260)
    bp_diastolic: int | None = Field(None, ge=30, le=160)
    glucose_mgdl: float | None = Field(None, ge=20, le=600)
    temperature_c: float | None = Field(None, ge=30, le=43)
    spo2: int | None = Field(None, ge=50, le=100)
    sleep_hours: float | None = Field(None, ge=0, le=24)
    sleep_quality: int | None = Field(None, ge=1, le=5)
    mood: int | None = Field(None, ge=1, le=5)
    stress: int | None = Field(None, ge=1, le=5)
    team_relations: int | None = Field(None, ge=1, le=5)
    eva_today: bool = False
    weight_kg: float | None = Field(None, ge=20, le=250)
    exercise_resistance_min: int | None = Field(None, ge=0, le=600)
    exercise_cardio_min: int | None = Field(None, ge=0, le=600)
    water_ml: int | None = Field(None, ge=0, le=10000)
    calories: int | None = Field(None, ge=0, le=10000)
    radiation_msv: float | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=2000)
    is_backdated: bool = False
    measured_at: datetime | None = None
    version: int = Field(1, ge=1)
    updated_at: datetime | None = None


class DailyLogOut(OwnedOut):
    id: UUID
    log_date: date
    mission_day: int | None
    heart_rate: int | None
    bp_systolic: int | None
    bp_diastolic: int | None
    glucose_mgdl: float | None
    temperature_c: float | None
    spo2: int | None
    sleep_hours: float | None
    sleep_quality: int | None
    mood: int | None
    stress: int | None
    team_relations: int | None
    eva_today: bool
    weight_kg: float | None
    exercise_resistance_min: int | None
    exercise_cardio_min: int | None
    water_ml: int | None
    calories: int | None
    radiation_msv: float | None
    notes: str | None
    is_backdated: bool
    measured_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    version: int


class SymptomIn(BaseModel):
    id: UUID
    symptom: str
    severity: int = Field(ge=1, le=3)

    @field_validator("symptom")
    @classmethod
    def _known_symptom(cls, value: str) -> str:
        if value not in SYMPTOM_IDS:
            raise ValueError(f"Unknown symptom '{value}'.")
        return value


class SymptomsBulkIn(BaseModel):
    """POST /symptoms: the full symptom list for one log. Entries of that
    log that are not in the list are soft-deleted (the list is the truth),
    so an empty list means "None today"."""

    log_id: UUID
    symptoms: list[SymptomIn] = Field(max_length=len(SYMPTOM_IDS))


class SymptomOut(OwnedOut):
    id: UUID
    log_id: UUID
    symptom: str
    severity: int
    created_at: UtcDatetime
    updated_at: UtcDatetime
    version: int
