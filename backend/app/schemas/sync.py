"""Sync protocol (SPEC 7.4) and the shape of each client record.

The records are the app's own Dexie rows (camelCase, see
frontend/lib/db/schema.ts). They are validated here with the same ranges
as everywhere else, then stored verbatim in the row's `payload` column,
so /sync/pull hands back exactly what a device sent. Unknown extra fields
are kept, not rejected: a newer app version must not lose data on an
older server.
"""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import SYMPTOM_IDS
from app.schemas.astronaut import CREW_CODE_PATTERN
from app.schemas.common import Environment, FollowupResponse, Role, Status, UtcDatetime
from app.schemas.misc import TIME_PATTERN

Entity = Literal[
    "astronaut",
    "daily_log",
    "symptom_entry",
    "evaluation",
    "advice_followup",
    "reminder",
    "surgeon_note",
    "audit_entry",
]


class PushItem(BaseModel):
    entity: Entity
    id: UUID
    op: Literal["upsert", "delete"]
    version: int = Field(1, ge=1)
    updatedAt: datetime | None = None
    data: dict[str, Any] | None = None


class PushIn(BaseModel):
    deviceId: UUID
    items: list[PushItem] = Field(max_length=200)


class ConflictOut(BaseModel):
    id: UUID
    entity: Entity
    # version       same record changed on two devices; the server copy is newer
    # same_date     another log already exists for that astronaut and date
    # parent_missing  the log this record belongs to is not on the server
    kind: Literal["version", "same_date", "parent_missing"]
    serverVersion: int | None = None
    serverData: dict[str, Any] | None = None
    serverDeleted: bool = False


class RejectedOut(BaseModel):
    id: UUID
    entity: Entity
    reason: str


class PushOut(BaseModel):
    accepted: list[UUID]
    conflicts: list[ConflictOut]
    rejected: list[RejectedOut]
    serverTime: UtcDatetime


class ChangeOut(BaseModel):
    id: UUID
    version: int
    updatedAt: UtcDatetime
    deleted: bool
    data: dict[str, Any]


class PullOut(BaseModel):
    serverTime: UtcDatetime
    changes: dict[str, list[ChangeOut]]


# ---- client record shapes ------------------------------------------------------


class _Record(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: UUID


class AstronautRecord(_Record):
    name: str = Field(min_length=1, max_length=100)
    crewCode: str = Field(min_length=3, max_length=20, pattern=CREW_CODE_PATTERN)
    role: Role
    environment: Environment
    missionStart: date | None = None
    missionEnd: date | None = None
    gravityChangedOn: date | None = None
    pinHash: str | None = Field(None, max_length=200)
    pinSalt: str | None = Field(None, max_length=200)
    isActive: bool = True
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)

    @field_validator("missionEnd", "missionStart", "gravityChangedOn", mode="before")
    @classmethod
    def _empty_is_none(cls, value: Any) -> Any:
        return None if value == "" else value


class DailyLogRecord(_Record):
    astronautId: UUID
    date: date
    isBackdated: bool = False
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
    weight_kg: float | None = Field(None, ge=20, le=250)
    eva_today: bool | None = None
    exercise_resistance_min: int | None = Field(None, ge=0, le=600)
    exercise_cardio_min: int | None = Field(None, ge=0, le=600)
    water_ml: int | None = Field(None, ge=0, le=10000)
    radiation_msv: float | None = Field(None, ge=0)
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)


class SymptomRecord(_Record):
    logId: UUID
    astronautId: UUID
    symptom: str
    severity: int = Field(ge=1, le=3)
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)

    @field_validator("symptom")
    @classmethod
    def _known_symptom(cls, value: str) -> str:
        if value not in SYMPTOM_IDS:
            raise ValueError(f"Unknown symptom '{value}'.")
        return value


class EvaluationRecord(_Record):
    logId: UUID
    astronautId: UUID
    overallStatus: Status
    rulesVersion: str = Field(min_length=1, max_length=20)
    result: dict[str, Any]
    createdAt: datetime


class FollowupRecord(_Record):
    astronautId: UUID
    date: date
    actionId: str = Field(min_length=1, max_length=100)
    evaluationId: UUID | None = None
    response: FollowupResponse
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)


class ReminderRecord(_Record):
    astronautId: UUID
    kind: str = Field(min_length=1, max_length=30)
    label: str = Field(min_length=1, max_length=60)
    time: str = Field(pattern=TIME_PATTERN)
    weekday: int | None = Field(None, ge=0, le=6)  # 0 = Sunday, as in the app
    enabled: bool = True
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)


class SurgeonNoteRecord(_Record):
    astronautId: UUID
    authorId: UUID
    authorName: str = Field(min_length=1, max_length=100)
    authorCrewCode: str = Field(min_length=3, max_length=20)
    text: str = Field(min_length=1, max_length=1000)
    createdAt: datetime
    updatedAt: datetime
    version: int = Field(ge=1)


class AuditRecord(_Record):
    """Who opened whose data on a device."""

    viewerId: UUID
    viewerName: str = Field(min_length=1, max_length=100)
    viewerCrewCode: str = Field(min_length=3, max_length=20)
    viewerRole: Role
    astronautId: UUID
    action: Literal["view"]
    at: datetime


RECORD_SCHEMAS: dict[str, type[_Record]] = {
    "astronaut": AstronautRecord,
    "daily_log": DailyLogRecord,
    "symptom_entry": SymptomRecord,
    "evaluation": EvaluationRecord,
    "advice_followup": FollowupRecord,
    "reminder": ReminderRecord,
    "surgeon_note": SurgeonNoteRecord,
    "audit_entry": AuditRecord,
}
