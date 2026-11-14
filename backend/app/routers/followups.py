from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.db.models import AdviceFollowup, GameState, utcnow
from app.deps import (
    CurrentUser,
    Session,
    owned,
    resolve_read_target,
    resolve_write_target,
)
from app.schemas.misc import FollowupIn, FollowupOut, GameStateIn, GameStateOut

router = APIRouter(tags=["followups", "gamification"])


@router.post("/followups", response_model=FollowupOut)
async def upsert_followup(body: FollowupIn, user: CurrentUser, session: Session) -> dict:
    """Record "did you follow the advice". Idempotent on ``id``."""
    owner = resolve_write_target(user, body.astronaut_id)
    existing = await session.get(AdviceFollowup, body.id)
    if existing is not None and existing.astronaut_id != owner.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own data.")
    now = utcnow()
    if existing is None:
        followup = AdviceFollowup(
            id=body.id,
            astronaut_id=owner.id,
            evaluation_id=body.evaluation_id,
            action_id=body.action_id,
            followup_date=body.followup_date,
            response=body.response,
            note=body.note,
            created_at=now,
            updated_at=now,
        )
        session.add(followup)
    else:
        followup = existing
        followup.evaluation_id = body.evaluation_id
        followup.action_id = body.action_id
        followup.followup_date = body.followup_date
        followup.response = body.response
        followup.note = body.note
        followup.updated_at = now
        followup.version += 1
    await session.commit()
    return owned(followup, owner)


@router.get("/followups", response_model=list[FollowupOut])
async def list_followups(
    user: CurrentUser, session: Session, astronaut_id: UUID | None = None
) -> list[dict]:
    owner = await resolve_read_target(session, user, astronaut_id, "advice_followup")
    followups = (
        (
            await session.execute(
                select(AdviceFollowup)
                .where(AdviceFollowup.astronaut_id == owner.id)
                .order_by(AdviceFollowup.followup_date.desc(), AdviceFollowup.action_id)
            )
        )
        .scalars()
        .all()
    )
    return [owned(followup, owner) for followup in followups]


def _game_out(state: GameState | None, owner) -> dict:
    """With nothing stored, the answer is zeros and ``updated_at: null`` —
    the true state, not a made-up one."""
    return {
        "astronaut_id": owner.id,
        "name": owner.display_name,
        "crew_code": owner.crew_code,
        "points": state.points if state else 0,
        "level": state.level if state else 1,
        "current_streak": state.current_streak if state else 0,
        "best_streak": state.best_streak if state else 0,
        "badges": state.badges if state else [],
        "updated_at": state.updated_at if state else None,
        "version": state.version if state else 0,
    }


@router.get("/gamification", response_model=GameStateOut)
async def get_gamification(
    user: CurrentUser, session: Session, astronaut_id: UUID | None = None
) -> dict:
    owner = await resolve_read_target(session, user, astronaut_id, "game_state")
    return _game_out(await session.get(GameState, owner.id), owner)


@router.put("/gamification", response_model=GameStateOut)
async def put_gamification(
    body: GameStateIn, user: CurrentUser, session: Session
) -> dict:
    """Store the snapshot the app derived from your own check-ins."""
    owner = resolve_write_target(user, body.astronaut_id)
    state = await session.get(GameState, owner.id)
    values = body.model_dump(exclude={"astronaut_id"})
    if state is None:
        state = GameState(astronaut_id=owner.id, **values)
        session.add(state)
    else:
        for field, value in values.items():
            setattr(state, field, value)
        state.version += 1
    state.updated_at = utcnow()
    await session.commit()
    return _game_out(state, owner)
