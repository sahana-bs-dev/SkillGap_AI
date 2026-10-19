import hashlib, re

def jd_fingerprint(jd_text: str | None) -> str | None:
    if not jd_text or not jd_text.strip():
        return None
    normalised = re.sub(r"\s+", " ", jd_text).strip().lower()
    return hashlib.sha256(normalised.encode()).hexdigest()[:8]

def jd_title(jd_text: str | None, role_title: str | None = None) -> str | None:
    if role_title:                     # JDAnalysisOutput.role_title, best source
        return role_title.strip()[:80]
    if not jd_text:
        return None
    first = next((l.strip() for l in jd_text.splitlines() if l.strip()), None)
    return first[:80] if first else None