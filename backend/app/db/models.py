"""SQLAlchemy models for SPEC 6.2.

Generic types only (``Uuid``, ``JSON``, ``DateTime(timezone=True)``), so the
same models and the same migration run on SQLite and PostgreSQL. Arrays are
stored as JSON; NUMERIC columns are ``Float``.

No row is ever created here or in a migration: a fresh database has zero
astronauts and zero logs.

Differences from the SPEC 6.2 listing, each recorded in docs/DECISIONS.md:
- astronauts.gravity_changed_on (added by the Environment screen, C10)
- advice_followups.response ('yes'|'partly'|'no') instead of a boolean,
  plus followup_date: this is what the app actually records
- reminders.local_time is 'HH:MM' text; reminders.deleted_at for soft delete
- sync (C14): `payload` and `server_updated_at` on every synced table,
  astronauts.client_pin_hash/salt, advice_followups.deleted_at, and the
  sync_conflicts table
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.constants import ENVIRONMENTS, FOLLOWUP_RESPONSES, ROLES


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _in(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


TZDateTime = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class Astronaut(Base):
    __tablename__ = "astronauts"
    __table_args__ = (
        CheckConstraint(_in("role", ROLES), name="ck_astronauts_role"),
        CheckConstraint(_in("environment", ENVIRONMENTS), name="ck_astronauts_environment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    crew_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="astronaut")
    pin_hash: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    gravity_changed_on: Mapped[date | None] = mapped_column(Date)
    mission_start: Mapped[date | None] = mapped_column(Date)
    mission_end: Mapped[date | None] = mapped_column(Date)
    birth_year: Mapped[int | None] = mapped_column(Integer)
    sex_at_birth: Mapped[str | None] = mapped_column(Text)
    height_cm: Mapped[float | None] = mapped_column(Float)
    baseline_weight_kg: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # The app's own PIN hash and salt (PBKDF2, see frontend/lib/db/pin.ts),
    # synced so a second device can unlock the same astronaut with the
    # same PIN. `pin_hash` above is the server-format hash, set only when
    # the astronaut was registered through POST /astronauts.
    client_pin_hash: Mapped[str | None] = mapped_column(Text)
    client_pin_salt: Mapped[str | None] = mapped_column(Text)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class DailyLog(Base):
    __tablename__ = "daily_logs"
    __table_args__ = (
        UniqueConstraint("astronaut_id", "log_date", name="uq_daily_logs_astronaut_date"),
        Index("ix_daily_logs_astronaut_date", "astronaut_id", "log_date"),
        Index("ix_daily_logs_updated_at", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # generated on client
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    mission_day: Mapped[int | None] = mapped_column(Integer)
    heart_rate: Mapped[int | None] = mapped_column(Integer)
    bp_systolic: Mapped[int | None] = mapped_column(Integer)
    bp_diastolic: Mapped[int | None] = mapped_column(Integer)
    glucose_mgdl: Mapped[float | None] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    spo2: Mapped[int | None] = mapped_column(Integer)
    sleep_hours: Mapped[float | None] = mapped_column(Float)
    sleep_quality: Mapped[int | None] = mapped_column(Integer)
    mood: Mapped[int | None] = mapped_column(Integer)
    stress: Mapped[int | None] = mapped_column(Integer)
    team_relations: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    eva_today: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exercise_resistance_min: Mapped[int | None] = mapped_column(Integer)
    exercise_cardio_min: Mapped[int | None] = mapped_column(Integer)
    water_ml: Mapped[int | None] = mapped_column(Integer)
    calories: Mapped[int | None] = mapped_column(Integer)
    radiation_msv: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    is_backdated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    measured_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class SymptomEntry(Base):
    __tablename__ = "symptom_entries"
    __table_args__ = (
        CheckConstraint("severity BETWEEN 1 AND 3", name="ck_symptom_entries_severity"),
        Index("ix_symptom_entries_astronaut_created", "astronaut_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    log_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("daily_logs.id"), nullable=False)
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    symptom: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class Evaluation(Base):
    """Stored rule-engine results. Written by C13 (/evaluate) and C14
    (sync); C12 only reads the latest status for the crew list."""

    __tablename__ = "evaluations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    log_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("daily_logs.id"), nullable=False)
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    overall_status: Mapped[str] = mapped_column(Text, nullable=False)
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    rules_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class AdviceFollowup(Base):
    __tablename__ = "advice_followups"
    __table_args__ = (
        CheckConstraint(_in("response", FOLLOWUP_RESPONSES), name="ck_advice_followups_response"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    evaluation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    action_id: Mapped[str] = mapped_column(Text, nullable=False)
    followup_date: Mapped[date] = mapped_column(Date, nullable=False)
    response: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    local_time: Mapped[str] = mapped_column(String(5), nullable=False)  # "HH:MM"
    days_of_week: Mapped[list[int]] = mapped_column(JSON, nullable=False)  # 1=Mon .. 7=Sun
    message: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    # Sync (C14): the client record exactly as the app sent it (returned
    # unchanged by /sync/pull, so nothing is lost in translation), and the
    # SERVER's clock at the last change (the pull cursor; device clocks
    # are not trusted for that).
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class GameState(Base):
    __tablename__ = "game_state"

    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), primary_key=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    badges: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class SyncDevice(Base):
    """Used by sync (C14)."""

    __tablename__ = "sync_devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    label: Mapped[str | None] = mapped_column(Text)
    last_seen_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class SurgeonNote(Base):
    """A flight surgeon's note about one astronaut (C15). Append-only in
    the app: never edited or deleted there."""

    __tablename__ = "surgeon_notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    astronaut_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("astronauts.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    payload: Mapped[dict | None] = mapped_column(JSON)
    server_updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, nullable=False, default=utcnow, onupdate=utcnow, index=True
    )


class SyncConflict(Base):
    """The losing side of every sync conflict, kept verbatim (SPEC 7.4:
    "never lose a health record"). Nothing here is ever deleted by sync."""

    __tablename__ = "sync_conflicts"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    entity: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    astronaut_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    device_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # 'version' (same record edited on two devices) or 'same_date' (two
    # different logs for one astronaut and date).
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    # Which side lost and is stored here: 'client' or 'server'.
    loser: Mapped[str] = mapped_column(Text, nullable=False)
    losing_version: Mapped[int | None] = mapped_column(Integer)
    losing_payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)


class AuditLog(Base):
    """SPEC 13: "Audit log for ground-view access." Written whenever a
    commander/surgeon/admin reads another astronaut's data."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    actor: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str | None] = mapped_column(Text)
    entity: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False, default=utcnow)
    # Set for entries that came from a device through sync (the app's own
    # id for the entry), so a repeated push cannot log the same view twice.
    client_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, unique=True)
