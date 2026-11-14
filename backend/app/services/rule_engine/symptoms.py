"""Symptom helpers (pipeline step 2).

SPEC 4.4 defines no single-symptom rule that is independent of a
combination, so, exactly as in the TypeScript engine, there is no separate
"symptom rules" stage: every symptom-driven result is a combination rule
in combos.py. This module holds the lookups those rules share.
"""

from typing import Any

Symptoms = list[dict[str, Any]]


def has_symptom(symptoms: Symptoms, symptom_id: str, min_severity: int = 1) -> bool:
    return any(
        s.get("symptom") == symptom_id and s.get("severity", 0) >= min_severity
        for s in symptoms
    )


def has_any(symptoms: Symptoms, symptom_ids: list[str]) -> bool:
    return any(has_symptom(symptoms, symptom_id) for symptom_id in symptom_ids)
