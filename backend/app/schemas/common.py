from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict

Role = Literal["astronaut", "commander", "surgeon", "admin"]
Environment = Literal["spacecraft", "station", "rover", "moon_base", "mars_base"]
Status = Literal["green", "yellow", "red", "critical"]
FollowupResponse = Literal["yes", "partly", "no"]


def _as_utc(value: datetime) -> datetime:
    """SQLite gives back naive datetimes (it has no timezone type); they
    were stored as UTC. Make every timestamp in a response explicit UTC so
    SQLite and PostgreSQL answer identically."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class OwnedOut(BaseModel):
    """SPEC 7.3: "Responses always include astronaut_id, name and crew_code
    so the UI can label the data."""

    model_config = ConfigDict(from_attributes=True)

    astronaut_id: UUID
    name: str
    crew_code: str
