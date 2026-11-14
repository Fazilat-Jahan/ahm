from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.db.models import Astronaut, Reminder, utcnow
from app.deps import (
    CurrentUser,
    Session,
    owned,
    resolve_read_target,
    resolve_write_target,
)
from app.schemas.misc import ReminderCreate, ReminderOut, ReminderUpdate

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=list[ReminderOut])
async def list_reminders(
    user: CurrentUser, session: Session, astronaut_id: UUID | None = None
) -> list[dict]:
    owner = await resolve_read_target(session, user, astronaut_id, "reminder")
    reminders = (
        (
            await session.execute(
                select(Reminder)
                .where(Reminder.astronaut_id == owner.id, Reminder.deleted_at.is_(None))
                .order_by(Reminder.local_time, Reminder.message)
            )
        )
        .scalars()
        .all()
    )
    return [owned(reminder, owner) for reminder in reminders]


@router.post("", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    body: ReminderCreate, user: CurrentUser, session: Session
) -> dict:
    owner = resolve_write_target(user, body.astronaut_id)
    if await session.get(Reminder, body.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A reminder with that id already exists.")
    reminder = Reminder(
        id=body.id,
        astronaut_id=owner.id,
        kind=body.kind,
        local_time=body.local_time,
        days_of_week=body.days_of_week,
        message=body.message,
        enabled=body.enabled,
    )
    session.add(reminder)
    await session.commit()
    return owned(reminder, owner)


async def _own_reminder(session, user: Astronaut, reminder_id: UUID) -> Reminder:
    reminder = await session.get(Reminder, reminder_id)
    if reminder is None or reminder.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found.")
    resolve_write_target(user, reminder.astronaut_id)
    return reminder


@router.put("/{reminder_id}", response_model=ReminderOut)
async def update_reminder(
    reminder_id: UUID, body: ReminderUpdate, user: CurrentUser, session: Session
) -> dict:
    reminder = await _own_reminder(session, user, reminder_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(reminder, field, value)
    reminder.updated_at = utcnow()
    reminder.version += 1
    await session.commit()
    return owned(reminder, user)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: UUID, user: CurrentUser, session: Session
) -> Response:
    """Soft delete, so the deletion can be synced to other devices."""
    reminder = await _own_reminder(session, user, reminder_id)
    now = utcnow()
    reminder.deleted_at = now
    reminder.updated_at = now
    reminder.version += 1
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
