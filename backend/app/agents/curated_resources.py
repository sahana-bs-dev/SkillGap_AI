"""
Loads the curated learning-resource catalog and does a simple, forgiving
lookup by skill name. The Learning Agent's prompt is written to ONLY pick
from what this returns — it never invents a URL.

If a skill has no curated entry, we fall back to a live YouTube search
(real, verifiable video URLs — not LLM-generated) for the "learn" resource
only. Results are cached to disk so the same skill is never searched twice.
"""

from __future__ import annotations

import json
import requests
from functools import lru_cache
from pathlib import Path

from app.config import YOUTUBE_API_KEY

_RESOURCES_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_resources.json"
_YOUTUBE_CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube_fallback_cache.json"

_YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_YOUTUBE_TIMEOUT_SECONDS = 5


@lru_cache(maxsize=1)
def _load_resources() -> dict:
    with open(_RESOURCES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_youtube_cache() -> dict:
    if not _YOUTUBE_CACHE_PATH.exists():
        return {}
    with open(_YOUTUBE_CACHE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_youtube_cache(cache: dict) -> None:
    with open(_YOUTUBE_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def _search_youtube_top_result(skill: str, query_suffix: str) -> dict | None:
    """
    Calls the real YouTube Data API v3 and returns the top result as
    {"title": ..., "url": ...}, or None if the call fails for any reason
    (no key set, network error, quota exceeded, zero results). This never
    raises — a fallback failure should degrade to "no resources found",
    not crash the Learning Agent's request.
    """
    if not YOUTUBE_API_KEY:
        return None

    try:
        response = requests.get(
            _YOUTUBE_SEARCH_URL,
            params={
                "part": "snippet",
                "q": f"{skill} {query_suffix}",
                "type": "video",
                "maxResults": 1,
                "order": "relevance",
                "key": YOUTUBE_API_KEY,
            },
            timeout=_YOUTUBE_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        items = response.json().get("items", [])
        if not items:
            return None

        video_id = items[0]["id"]["videoId"]
        title = items[0]["snippet"]["title"]
        return {"title": title, "url": f"https://www.youtube.com/watch?v={video_id}"}

    except (requests.RequestException, KeyError, ValueError):
        # Network failure, timeout, quota exceeded, or unexpected response
        # shape — treat all of these as "no result", not a crash.
        return None


def get_candidates_for_skill(skill: str) -> dict:
    resources = _load_resources()
    key = skill.strip().lower()

    curated = None
    if key in resources:
        curated = resources[key]
    else:
        # Loose fallback so "React.js" / "ReactJS" still hits the "react" entry.
        for candidate_key, value in resources.items():
            if candidate_key in key or key in candidate_key:
                curated = value
                break

    # Every skill (curated or not) also gets a YouTube video added in,
    # cached by skill name so it's only ever searched once.
    cache = _load_youtube_cache()
    if key in cache:
        youtube_extra = cache[key]
    else:
        learn_result = _search_youtube_top_result(key, "tutorial for beginners")
        practice_result = _search_youtube_top_result(key, "practice exercises hands-on")
        youtube_extra = {
            "learn": [learn_result] if learn_result else [],
            "practice": [practice_result] if practice_result else [],
        }
        cache[key] = youtube_extra
        _save_youtube_cache(cache)

    if curated is None and not youtube_extra["learn"] and not youtube_extra["practice"]:
        return {}

    base = curated or {"learn": [], "practice": []}
    return {
        "learn": base.get("learn", []) + youtube_extra["learn"],
        "practice": base.get("practice", []) + youtube_extra["practice"],
    }