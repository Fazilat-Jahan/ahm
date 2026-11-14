"""Astronaut and auth schemas. Limits match the frontend's Zod schema
(frontend/lib/db/astronautSchema.ts): name 1-100, crew ID 3-20 letters,
digits and hyphens, PIN 4-6 digits, mission end not before start."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import Environment, Role, Status, UtcDatetime

CREW_CODE_PATTERN = r"^[A-Za-z0-9-]+$"
PIN_PATTERN = r"^\d{4,6}$"


class LoginIn(BaseModel):
    crew_code: str = Field(min_length=3, max_length=20)
    pin: str = Field(pattern=PIN_PATTERN)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    astronaut_id: UUID
    name: str
    crew_code: str
    role: Role


class _AstronautFields(BaseModel):
    @field_validator("crew_code", check_fields=False)
    @classmethod
    def _upper_crew_code(cls, value: str | None) -> str | None:
        # "ast-001" and "AST-001" are the same crew member (as on the client).
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("name", check_fields=False)
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise ValueError("Full name is required.")
        return value


class AstronautCreate(_AstronautFields):
    id: UUID | None = None  # the client may supply its own UUID
    name: str = Field(min_length=1, max_length=100)
    crew_code: str = Field(min_length=3, max_length=20, pattern=CREW_CODE_PATTERN)
    role: Role = "astronaut"
    environment: Environment
    mission_start: date | None = None
    mission_end: date | None = None
    pin: str = Field(pattern=PIN_PATTERN)

    @model_validator(mode="after")
    def _dates_in_order(self) -> "AstronautCreate":
        if self.mission_start and self.mission_end and self.mission_end < self.mission_start:
            raise ValueError("Mission end can't be before mission start.")
        return self


class AstronautUpdate(_AstronautFields):
    """Profile / environment / mission dates. Role and crew ID can only be
    changed by an admin (enforced in the router)."""

    name: str | None = Field(None, min_length=1, max_length=100)
    crew_code: str | None = Field(None, min_length=3, max_length=20, pattern=CREW_CODE_PATTERN)
    role: Role | None = None
    environment: Environment | None = None
    gravity_changed_on: date | None = None
    mission_start: date | None = None
    mission_end: date | None = None
    pin: str | None = Field(None, pattern=PIN_PATTERN)


class AstronautOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    astronaut_id: UUID
    name: str
    crew_code: str
    role: Role
    environment: Environment
    gravity_changed_on: date | None
    mission_start: date | None
    mission_end: date | None
    is_active: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
    version: int


class CrewListItem(AstronautOut):
    """GET /astronauts row: profile plus the last check-in date and the
    latest stored overall status (both null until real data exists)."""

    last_checkin_date: date | None = None
    latest_overall_status: Status | None = None
