"""
Loads the curated learning-resource catalog and does a simple, forgiving
lookup by skill name. The Learning Agent's prompt is written to ONLY pick
from what this returns — it never invents a URL. If a skill has no entry
here, the candidate set is empty and the agent is instructed to leave
that skill's resources empty rather than fabricate one.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_RESOURCES_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_resources.json"


@lru_cache(maxsize=1)
def _load_resources() -> dict:
    with open(_RESOURCES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_candidates_for_skill(skill: str) -> dict:
    resources = _load_resources()
    key = skill.strip().lower()

    if key in resources:
        return resources[key]

    # Loose fallback so "React.js" / "ReactJS" still hits the "react" entry.
    for candidate_key, value in resources.items():
        if candidate_key in key or key in candidate_key:
            return value

    return {}