import hmac
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.config import settings
from app.deps import Session
from app.schemas.sync import PullOut, PushIn, PushOut
from app.services import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])


def require_sync_key(
    x_sync_key: Annotated[str | None, Header()] = None,
) -> None:
    """Sync is device-to-server, not per-astronaut: a shared habitat tablet
    holds several astronauts' records and must be able to send all of
    them. So these two endpoints are protected by one shared key
    (SYNC_KEY) that is typed into each trusted device once, instead of a
    personal token. With no key configured, sync is switched off."""
    if not settings.sync_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Sync is not enabled on this server (SYNC_KEY is not set).",
        )
    if x_sync_key is None or not hmac.compare_digest(
        x_sync_key.encode(), settings.sync_key.encode()
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong or missing sync key.")


@router.post("/push", response_model=PushOut, dependencies=[Depends(require_sync_key)])
async def push(body: PushIn, session: Session) -> dict:
    """A device sends a batch from its outbox, in order. Safe to repeat."""
    return await sync_service.push(session, body.deviceId, body.items)


@router.get("/pull", response_model=PullOut, dependencies=[Depends(require_sync_key)])
async def pull(
    session: Session,
    since: Annotated[
        datetime | None,
        Query(description="The `serverTime` of your previous pull. Omit for everything."),
    ] = None,
) -> dict:
    return await sync_service.pull(session, since)
