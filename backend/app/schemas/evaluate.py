"""POST /evaluate input and output.

The request body is the rule engine's own input (the same keys as the
TypeScript `EvalInput` and the shared test vectors), validated with the
same sanity ranges as a stored daily log, plus two optional ids used to
store the result.
"""

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import SYMPTOM_IDS
from app.schemas.common import Environment, OwnedOut, Status, UtcDatetime


class _Strict(BaseModel):
    # An unknown key is a client bug (a misspelt field would otherwise be
    # silently ignored and the measurement left out of the evaluation).
    model_config = ConfigDict(extra="forbid")


class EvalLog(_Strict):
    date: date
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
    calories: int | None = Field(None, ge=0, le=10000)
    radiation_msv: float | None = Field(None, ge=0)
    selfHarmThoughts: bool | None = None


class EvalSymptom(_Strict):
    symptom: str
    severity: int = Field(ge=1, le=3)

    @field_validator("symptom")
    @classmethod
    def _known_symptom(cls, value: str) -> str:
        if value not in SYMPTOM_IDS:
            raise ValueError(f"Unknown symptom '{value}'.")
        return value


class EvalHistoryDay(_Strict):
    date: date
    log: EvalLog
    symptoms: list[EvalSymptom] = Field(default_factory=list, max_length=len(SYMPTOM_IDS))


class EvalMission(_Strict):
    environment: Environment
    missionDay: int = Field(ge=1)
    daysSinceGravityChange: int | None = Field(None, ge=1)
    missionTotalDays: int | None = Field(None, ge=1)
    radiationDailyBudgetMsv: float | None = Field(None, ge=0)
    radiationMissionBudgetMsv: float | None = Field(None, ge=0)
    radiationCumulativeMsv: float | None = Field(None, ge=0)


class EvalCrewSignals(_Strict):
    sameSymptomReportedByOthers: bool | None = None


class EvaluateIn(_Strict):
    log: EvalLog
    symptoms: list[EvalSymptom] = Field(default_factory=list, max_length=len(SYMPTOM_IDS))
    # Most recent first. 60 days is far more than any trend rule looks at.
    history: list[EvalHistoryDay] = Field(default_factory=list, max_length=60)
    mission: EvalMission
    crewSignals: EvalCrewSignals | None = None
    # Give the id of one of YOUR stored daily logs to store the result
    # with it. Leave out for a stateless evaluation: nothing is saved.
    log_id: UUID | None = None
    evaluation_id: UUID | None = None

    def engine_input(self) -> dict[str, Any]:
        """Plain dict for the engine: dates as ISO text, unset fields
        absent (exactly the shape of the shared vectors)."""
        return self.model_dump(
            mode="json", exclude_none=True, exclude={"log_id", "evaluation_id"}
        )


class EvaluateOut(OwnedOut):
    result: dict[str, Any]  # the engine's EvaluationResult, unchanged
    rules_version: str
    stored: bool
    evaluation_id: UUID | None


class StoredEvaluationOut(OwnedOut):
    id: UUID
    log_id: UUID
    overall_status: Status
    rules_version: str
    result: dict[str, Any]
    created_at: UtcDatetime
