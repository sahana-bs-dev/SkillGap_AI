import hashlib
import re
from datetime import datetime, timezone
from typing import Optional


def text_fingerprint(text: Optional[str], length: int = 8) -> Optional[str]:
    """Same text (ignoring case/whitespace) -> same value."""
    if not text or not text.strip():
        return None
    normalised = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(normalised.encode()).hexdigest()[:length]


def derive_jd_title(jd_text: Optional[str], role_title: Optional[str] = None) -> Optional[str]:
    if role_title and role_title.strip():
        return role_title.strip()[:80]
    if not jd_text:
        return None
    first = next((l.strip() for l in jd_text.splitlines() if l.strip()), None)
    return first[:80] if first else None


def iso_utc(dt: datetime) -> str:
    """Mongo hands back naive datetimes; they are UTC, so say so."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()