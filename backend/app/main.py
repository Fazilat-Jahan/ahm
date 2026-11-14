from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    astronauts,
    auth,
    evaluate,
    followups,
    health,
    logs,
    reminders,
    sync,
)

app = FastAPI(title="Astronaut Health Monitor API")

# Browser access for the frontend: the exact origins in CORS_ORIGINS, plus
# (by default) any origin on this machine or a private LAN, so a tablet on
# the habitat network can reach the server with no internet. No tables are
# created and no data is inserted at startup: the schema comes from
# `alembic upgrade head`, the data only from the crew.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(astronauts.router, prefix=API_PREFIX)
app.include_router(logs.router, prefix=API_PREFIX)
app.include_router(evaluate.router, prefix=API_PREFIX)
app.include_router(reminders.router, prefix=API_PREFIX)
app.include_router(followups.router, prefix=API_PREFIX)
app.include_router(sync.router, prefix=API_PREFIX)
