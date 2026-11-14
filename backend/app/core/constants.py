"""Shared enumerations. These mirror the frontend exactly:

- ROLES / ENVIRONMENTS: frontend/lib/db/schema.ts and lib/rules/types.ts
- SYMPTOM_IDS: frontend/config/symptoms.ts (SPEC 4.3)

A test in app/tests/test_schemas.py checks the symptom list against the
frontend file, so the two cannot drift silently.
"""

ROLES = ("astronaut", "commander", "surgeon", "admin")
ENVIRONMENTS = ("spacecraft", "station", "rover", "moon_base", "mars_base")

# Roles that may read every astronaut's data (never write it).
CREW_READ_ROLES = frozenset({"commander", "surgeon", "admin"})

SYMPTOM_IDS = (
    "headache",
    "dizziness",
    "nausea_vomiting",
    "fatigue",
    "muscle_aches",
    "back_pain",
    "joint_pain",
    "chest_pain",
    "shortness_of_breath",
    "palpitations",
    "fever_chills",
    "cough_sore_throat",
    "rash_skin_irritation",
    "vision_changes",
    "eye_pain",
    "facial_puffiness",
    "loss_of_appetite",
    "abdominal_pain",
    "insomnia",
    "low_mood",
    "anxiety",
    "irritability",
    "difficulty_concentrating",
    "ear_congestion",
    "tingling_numbness",
)

FOLLOWUP_RESPONSES = ("yes", "partly", "no")
STATUSES = ("green", "yellow", "red", "critical")
