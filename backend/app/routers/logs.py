from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.db.models import DailyLog, SymptomEntry, utcnow
from app.deps import (
    CurrentUser,
    Session,
    owned,
    resolve_read_target,
    resolve_write_target,
)
from app.schemas.log import DailyLogIn, DailyLogOut, SymptomOut, SymptomsBulkIn

router = APIRouter(tags=["logs"])

_LOG_FIELDS = (
    "log_date",
    "mission_day",
    "heart_rate",
    "bp_systolic",
    "bp_diastolic",
    "glucose_mgdl",
    "temperature_c",
    "spo2",
    "sleep_hours",
    "sleep_quality",
    "mood",
    "stress",
    "team_relations",
    "eva_today",
    "weight_kg",
    "exercise_resistance_min",
    "exercise_cardio_min",
    "water_ml",
    "calories",
    "radiation_msv",
    "notes",
    "is_backdated",
    "measured_at",
)


@router.post("/logs", response_model=DailyLogOut)
async def upsert_log(body: DailyLogIn, user: CurrentUser, session: Session) -> dict:
    """Create or update a daily log. Idempotent on ``id``: sending the same
    log twice leaves one row. One log per astronaut per date."""
    owner = resolve_write_target(user, body.astronaut_id)

    existing = await session.get(DailyLog, body.id)
    if existing is not None and existing.astronaut_id != owner.id:
        # Do not reveal that the id belongs to someone else's log.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own data.")

    same_date = (
        await session.execute(
            select(DailyLog).where(
                DailyLog.astronaut_id == owner.id,
                DailyLog.log_date == body.log_date,
                DailyLog.id != body.id,
            )
        )
    ).scalar_one_or_none()
    if same_date is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A log for {body.log_date} already exists (id {same_date.id}). "
            "Update that log instead of creating a second one.",
        )

    now = utcnow()
    values = {field: getattr(body, field) for field in _LOG_FIELDS}
    if existing is None:
        log = DailyLog(
            id=body.id,
            astronaut_id=owner.id,
            version=body.version,
            created_at=now,
            updated_at=body.updated_at or now,
            **values,
        )
        session.add(log)
    else:
        log = existing
        for field, value in values.items():
            setattr(log, field, value)
        log.version = max(existing.version + 1, body.version)
        log.updated_at = body.updated_at or now
        log.deleted_at = None
    await session.commit()
    return owned(log, owner)


@router.get("/logs", response_model=list[DailyLogOut])
async def list_logs(
    user: CurrentUser,
    session: Session,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    astronaut_id: UUID | None = None,
) -> list[dict]:
    """History for charts, oldest first. ``astronaut_id`` defaults to you."""
    owner = await resolve_read_target(session, user, astronaut_id, "daily_log")
    query = select(DailyLog).where(
        DailyLog.astronaut_id == owner.id, DailyLog.deleted_at.is_(None)
    )
    if date_from is not None:
        query = query.where(DailyLog.log_date >= date_from)
    if date_to is not None:
        query = query.where(DailyLog.log_date <= date_to)
    logs = (await session.execute(query.order_by(DailyLog.log_date))).scalars().all()
    return [owned(log, owner) for log in logs]


@router.get("/logs/today", response_model=DailyLogOut)
async def get_today_log(
    user: CurrentUser,
    session: Session,
    on: Annotated[
        date | None,
        Query(description="The mission-local date. Defaults to the server's date."),
    ] = None,
    astronaut_id: UUID | None = None,
) -> dict:
    owner = await resolve_read_target(session, user, astronaut_id, "daily_log")
    log = (
        await session.execute(
            select(DailyLog).where(
                DailyLog.astronaut_id == owner.id,
                DailyLog.log_date == (on or date.today()),
                DailyLog.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if log is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No log for that date yet.")
    return owned(log, owner)


@router.post("/symptoms", response_model=list[SymptomOut])
async def upsert_symptoms(
    body: SymptomsBulkIn, user: CurrentUser, session: Session
) -> list[dict]:
    """Bulk upsert the symptom entries of one of your own logs."""
    log = await session.get(DailyLog, body.log_id)
    if log is None or log.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Log not found.")
    owner = resolve_write_target(user, log.astronaut_id)

    current = {
        entry.id: entry
        for entry in (
            await session.execute(
                select(SymptomEntry).where(SymptomEntry.log_id == log.id)
            )
        )
        .scalars()
        .all()
    }
    now = utcnow()
    sent_ids = set()
    for item in body.symptoms:
        sent_ids.add(item.id)
        entry = current.get(item.id)
        if entry is None:
            other = await session.get(SymptomEntry, item.id)
            if other is not None:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Symptom id {item.id} already belongs to another log.",
                )
            session.add(
                SymptomEntry(
                    id=item.id,
                    log_id=log.id,
                    astronaut_id=owner.id,
                    symptom=item.symptom,
                    severity=item.severity,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            entry.symptom = item.symptom
            entry.severity = item.severity
            entry.updated_at = now
            entry.version += 1
            entry.deleted_at = None
    for entry_id, entry in current.items():
        if entry_id not in sent_ids and entry.deleted_at is None:
            entry.deleted_at = now
            entry.updated_at = now
            entry.version += 1
    await session.commit()
    return await _symptoms_of(session, log.id, owner)


async def _symptoms_of(session, log_id: UUID, owner) -> list[dict]:
    entries = (
        (
            await session.execute(
                select(SymptomEntry)
                .where(SymptomEntry.log_id == log_id, SymptomEntry.deleted_at.is_(None))
                .order_by(SymptomEntry.symptom)
            )
        )
        .scalars()
        .all()
    )
    return [owned(entry, owner) for entry in entries]


@router.get("/symptoms", response_model=list[SymptomOut])
async def list_symptoms(
    user: CurrentUser,
    session: Session,
    log_id: UUID | None = None,
    astronaut_id: UUID | None = None,
) -> list[dict]:
    """Symptoms of one log (``log_id``), or all of an astronaut's."""
    if log_id is not None:
        log = await session.get(DailyLog, log_id)
        if log is None or log.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Log not found.")
        owner = await resolve_read_target(session, user, log.astronaut_id, "symptom_entry")
        return await _symptoms_of(session, log.id, owner)
    owner = await resolve_read_target(session, user, astronaut_id, "symptom_entry")
    entries = (
        (
            await session.execute(
                select(SymptomEntry)
                .where(
                    SymptomEntry.astronaut_id == owner.id,
                    SymptomEntry.deleted_at.is_(None),
                )
                .order_by(SymptomEntry.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [owned(entry, owner) for entry in entries]
