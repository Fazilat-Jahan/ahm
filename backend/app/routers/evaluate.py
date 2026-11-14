import uuid
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.db.models import DailyLog, Evaluation, utcnow
from app.deps import CurrentUser, Session, resolve_read_target, resolve_write_target
from app.schemas.evaluate import EvaluateIn, EvaluateOut, StoredEvaluationOut
from app.services.rule_engine.engine import evaluate

router = APIRouter(tags=["evaluate"])


@router.post("/evaluate", response_model=EvaluateOut)
async def evaluate_payload(body: EvaluateIn, user: CurrentUser, session: Session) -> dict:
    """Run the rule engine on a payload (SPEC 7.3: stateless).

    The result is computed from the body alone; the server looks nothing
    up. If ``log_id`` names one of your own stored logs, the result is
    also stored with it, together with the rules version that produced it,
    so an old result stays explainable after thresholds change.
    """
    result = evaluate(body.engine_input())
    stored_id: UUID | None = None

    if body.log_id is not None:
        log = await session.get(DailyLog, body.log_id)
        if log is None or log.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Log not found.")
        owner = resolve_write_target(user, log.astronaut_id)

        evaluation_id = body.evaluation_id or uuid.uuid4()
        existing = await session.get(Evaluation, evaluation_id)
        if existing is not None and existing.astronaut_id != owner.id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "You can only change your own data."
            )
        if existing is None:
            session.add(
                Evaluation(
                    id=evaluation_id,
                    log_id=log.id,
                    astronaut_id=owner.id,
                    overall_status=result["overall"],
                    result_json=result,
                    rules_version=result["rulesVersion"],
                )
            )
        else:
            # Same evaluation id sent again: replace, never duplicate.
            existing.log_id = log.id
            existing.overall_status = result["overall"]
            existing.result_json = result
            existing.rules_version = result["rulesVersion"]
            existing.created_at = utcnow()
        await session.commit()
        stored_id = evaluation_id

    return {
        "astronaut_id": user.id,
        "name": user.display_name,
        "crew_code": user.crew_code,
        "result": result,
        "rules_version": result["rulesVersion"],
        "stored": stored_id is not None,
        "evaluation_id": stored_id,
    }


@router.get("/evaluations/latest", response_model=StoredEvaluationOut)
async def latest_evaluation(
    user: CurrentUser, session: Session, astronaut_id: UUID | None = None
) -> dict:
    owner = await resolve_read_target(session, user, astronaut_id, "evaluation")
    evaluation = (
        await session.execute(
            select(Evaluation)
            .where(Evaluation.astronaut_id == owner.id)
            .order_by(Evaluation.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if evaluation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No evaluation stored yet.")
    return {
        "astronaut_id": owner.id,
        "name": owner.display_name,
        "crew_code": owner.crew_code,
        "id": evaluation.id,
        "log_id": evaluation.log_id,
        "overall_status": evaluation.overall_status,
        "rules_version": evaluation.rules_version,
        "result": evaluation.result_json,
        "created_at": evaluation.created_at,
    }
