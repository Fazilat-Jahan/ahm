"""Authentication and the access rules of SPEC 7.3 / 13, in one place.

Rules (every data router goes through the two helpers below):

- READ   your own data: any role.
         another astronaut's data: commander, surgeon or admin only, and
         the read is written to the audit log.
- WRITE  health data (logs, symptoms, reminders, follow-ups, game state):
         your own only, for every role. A commander or surgeon can never
         change another astronaut's data.
"""

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import CREW_READ_ROLES
from app.core.security import decode_access_token
from app.db.models import Astronaut, AuditLog
from app.db.session import get_session

bearer = HTTPBearer(auto_error=False)

Session = Annotated[AsyncSession, Depends(get_session)]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_user(
    session: Session,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Astronaut | None:
    if credentials is None:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        astronaut_id = UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized("Invalid or expired token.") from None
    astronaut = await session.get(Astronaut, astronaut_id)
    # The role is read from the database on every request, not trusted from
    # the token, so a role change or deactivation takes effect at once.
    if astronaut is None or not astronaut.is_active or astronaut.deleted_at is not None:
        raise _unauthorized("Invalid or expired token.")
    return astronaut


async def get_current_user(
    user: Annotated[Astronaut | None, Depends(get_optional_user)],
) -> Astronaut:
    if user is None:
        raise _unauthorized("Not signed in.")
    return user


CurrentUser = Annotated[Astronaut, Depends(get_current_user)]
OptionalUser = Annotated[Astronaut | None, Depends(get_optional_user)]


def can_read_all(user: Astronaut) -> bool:
    return user.role in CREW_READ_ROLES


async def _load_astronaut(session: AsyncSession, astronaut_id: UUID) -> Astronaut:
    astronaut = await session.get(Astronaut, astronaut_id)
    if astronaut is None or astronaut.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found.")
    return astronaut


async def resolve_read_target(
    session: AsyncSession,
    user: Astronaut,
    astronaut_id: UUID | None,
    entity: str,
) -> Astronaut:
    """Whose data a GET is about. Omitted id = yourself."""
    if astronaut_id is None or astronaut_id == user.id:
        return user
    if not can_read_all(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You can only see your own data."
        )
    target = await _load_astronaut(session, astronaut_id)
    session.add(
        AuditLog(
            actor=f"{user.crew_code} ({user.role})",
            action="read",
            entity=entity,
            entity_id=target.id,
        )
    )
    await session.commit()
    return target


def resolve_write_target(user: Astronaut, astronaut_id: UUID | None) -> Astronaut:
    """Whose data a POST/PUT/DELETE changes: only ever your own."""
    if astronaut_id is not None and astronaut_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only change your own data. Other astronauts' data is read-only.",
        )
    return user


def owned(row: object, owner: Astronaut) -> dict:
    """Row columns plus the owner's label, for an ``OwnedOut`` response."""
    data = {column.name: getattr(row, column.name) for column in row.__table__.columns}  # type: ignore[attr-defined]
    data["astronaut_id"] = owner.id
    data["name"] = owner.display_name
    data["crew_code"] = owner.crew_code
    return data
