from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.security import create_access_token, verify_client_pin, verify_pin
from app.db.models import Astronaut
from app.deps import Session
from app.schemas.astronaut import LoginIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, session: Session) -> TokenOut:
    """Crew ID + PIN -> JWT. Local to this server: works on a LAN with no
    internet."""
    crew_code = body.crew_code.strip().upper()
    astronaut = (
        await session.execute(select(Astronaut).where(Astronaut.crew_code == crew_code))
    ).scalar_one_or_none()
    # One message for "no such crew ID" and "wrong PIN", so the endpoint
    # does not reveal which crew IDs exist.
    if (
        astronaut is None
        or astronaut.deleted_at is not None
        or not astronaut.is_active
        or not (
            verify_pin(body.pin, astronaut.pin_hash)
            or verify_client_pin(
                body.pin, astronaut.client_pin_hash, astronaut.client_pin_salt
            )
        )
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong crew ID or PIN.")
    return TokenOut(
        access_token=create_access_token(astronaut.id, astronaut.role, astronaut.crew_code),
        astronaut_id=astronaut.id,
        name=astronaut.display_name,
        crew_code=astronaut.crew_code,
        role=astronaut.role,  # type: ignore[arg-type]
    )
