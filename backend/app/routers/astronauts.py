from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_pin
from app.db.models import Astronaut, DailyLog, Evaluation, utcnow
from app.deps import (
    CurrentUser,
    OptionalUser,
    Session,
    can_read_all,
    resolve_read_target,
)
from app.schemas.astronaut import (
    AstronautCreate,
    AstronautOut,
    AstronautUpdate,
    CrewListItem,
)

router = APIRouter(prefix="/astronauts", tags=["astronauts"])


def to_out(astronaut: Astronaut) -> dict:
    return {
        "id": astronaut.id,
        "astronaut_id": astronaut.id,
        "name": astronaut.display_name,
        "crew_code": astronaut.crew_code,
        "role": astronaut.role,
        "environment": astronaut.environment,
        "gravity_changed_on": astronaut.gravity_changed_on,
        "mission_start": astronaut.mission_start,
        "mission_end": astronaut.mission_end,
        "is_active": astronaut.is_active,
        "created_at": astronaut.created_at,
        "updated_at": astronaut.updated_at,
        "version": astronaut.version,
    }


async def _crew_item(session: AsyncSession, astronaut: Astronaut) -> dict:
    last_date = (
        await session.execute(
            select(func.max(DailyLog.log_date)).where(
                DailyLog.astronaut_id == astronaut.id, DailyLog.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    latest_status = (
        await session.execute(
            select(Evaluation.overall_status)
            .where(Evaluation.astronaut_id == astronaut.id)
            .order_by(Evaluation.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {
        **to_out(astronaut),
        "last_checkin_date": last_date,
        "latest_overall_status": latest_status,
    }


@router.get("", response_model=list[CrewListItem])
async def list_astronauts(user: CurrentUser, session: Session) -> list[dict]:
    """Astronaut role: only yourself. Commander/surgeon/admin: everyone."""
    if not can_read_all(user):
        return [await _crew_item(session, user)]
    astronauts = (
        (
            await session.execute(
                select(Astronaut)
                .where(Astronaut.deleted_at.is_(None))
                .order_by(Astronaut.crew_code)
            )
        )
        .scalars()
        .all()
    )
    return [await _crew_item(session, astronaut) for astronaut in astronauts]


@router.post("", response_model=AstronautOut, status_code=status.HTTP_201_CREATED)
async def register_astronaut(
    body: AstronautCreate, user: OptionalUser, session: Session
) -> dict:
    """SPEC 7.3: "admin or first-run setup". With no astronaut in the
    database yet, anyone on the network may register the first one (there
    is nobody to sign in as). After that, only an admin can."""
    count = (await session.execute(select(func.count()).select_from(Astronaut))).scalar_one()
    if count > 0:
        if user is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Not signed in.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if user.role != "admin":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only an admin can register astronauts."
            )

    astronaut = Astronaut(
        display_name=body.name,
        crew_code=body.crew_code,
        role=body.role,
        environment=body.environment,
        mission_start=body.mission_start,
        mission_end=body.mission_end,
        pin_hash=hash_pin(body.pin),
    )
    if body.id is not None:
        astronaut.id = body.id
    session.add(astronaut)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'Crew ID "{body.crew_code}" is already registered.',
        ) from None
    return to_out(astronaut)


@router.get("/me", response_model=AstronautOut)
async def get_me(user: CurrentUser) -> dict:
    return to_out(user)


@router.get("/{astronaut_id}", response_model=AstronautOut)
async def get_astronaut(astronaut_id: UUID, user: CurrentUser, session: Session) -> dict:
    return to_out(await resolve_read_target(session, user, astronaut_id, "astronaut"))


@router.put("/{astronaut_id}", response_model=AstronautOut)
async def update_astronaut(
    astronaut_id: UUID, body: AstronautUpdate, user: CurrentUser, session: Session
) -> dict:
    """You may update your own profile, environment, mission dates and PIN.
    An admin may update anyone and is the only one who can change a role
    or a crew ID. Commander and surgeon cannot change other astronauts."""
    is_admin = user.role == "admin"
    if astronaut_id != user.id and not is_admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You can only change your own profile."
        )
    astronaut = await session.get(Astronaut, astronaut_id)
    if astronaut is None or astronaut.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found.")

    changes = body.model_dump(exclude_unset=True)
    if not is_admin and (
        ("role" in changes and changes["role"] != astronaut.role)
        or ("crew_code" in changes and changes["crew_code"] != astronaut.crew_code)
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only an admin can change a role or a crew ID."
        )

    start = changes.get("mission_start", astronaut.mission_start)
    end = changes.get("mission_end", astronaut.mission_end)
    if start and end and end < start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Mission end can't be before mission start.",
        )

    if "name" in changes and changes["name"] is not None:
        astronaut.display_name = changes["name"]
    if changes.get("pin"):
        astronaut.pin_hash = hash_pin(changes["pin"])
    for field in (
        "crew_code",
        "role",
        "environment",
        "gravity_changed_on",
        "mission_start",
        "mission_end",
    ):
        if field in changes and (
            changes[field] is not None
            or field in ("gravity_changed_on", "mission_start", "mission_end")
        ):
            setattr(astronaut, field, changes[field])
    astronaut.updated_at = utcnow()
    astronaut.version += 1
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That crew ID is already registered."
        ) from None
    return to_out(astronaut)
