"""
Rule driven smart matching engine (pure Python, no external ML services).

Weights (total 100):
    category    20
    item name   20
    description 20
    colour      10
    brand       10
    location    10
    date/time   10

Each field produces a 0..1 similarity which is multiplied by its weight.
Scores are stored on a 0..100 scale with High / Medium / Low confidence bands
configured per university. A match NEVER changes report status to returned —
a human officer must confirm.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Tuple

WEIGHTS: Dict[str, int] = {
    "category": 20,
    "name": 20,
    "description": 20,
    "colour": 10,
    "brand": 10,
    "location": 10,
    "datetime": 10,
}

STOPWORDS = {
    "the", "a", "an", "with", "and", "of", "in", "on", "at", "for", "to",
    "my", "is", "was", "it", "its", "inside", "near", "from", "colour", "color",
    "black", "blue", "red", "item", "items", "found", "lost", "please", "very",
}

COLOUR_SYNONYMS = {
    "black": {"black", "space black", "charcoal", "jet", "midnight", "dark grey", "dark gray"},
    "grey": {"grey", "gray", "silver", "graphite", "slate", "ash"},
    "white": {"white", "ivory", "cream", "off white", "pearl"},
    "blue": {"blue", "navy", "indigo", "cobalt", "teal", "azure", "denim"},
    "green": {"green", "olive", "sage", "emerald", "forest", "mint"},
    "red": {"red", "maroon", "crimson", "burgundy", "wine", "scarlet"},
    "brown": {"brown", "tan", "saddle", "camel", "beige", "khaki", "walnut", "chocolate"},
    "yellow": {"yellow", "gold", "mustard", "amber", "ochre", "orange", "tortoiseshell"},
    "pink": {"pink", "rose", "magenta", "blush"},
    "purple": {"purple", "violet", "lavender", "plum"},
}

BRAND_ALIASES = {
    "apple": {"apple", "iphone", "ipad", "macbook", "airpods", "mac"},
    "samsung": {"samsung", "galaxy"},
    "sony": {"sony", "walkman", "playstation"},
    "lenovo": {"lenovo", "thinkpad", "ideapad"},
    "dell": {"dell", "inspiron", "xps", "latitude"},
    "hp": {"hp", "pavilion", "elitebook"},
    "fossil": {"fossil"},
    "rayban": {"ray-ban", "ray ban", "rayban"},
    "nike": {"nike"},
    "boat": {"boat", "noise"},
}

WORD_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: Optional[str]) -> List[str]:
    if not text:
        return []
    return [w for w in WORD_RE.findall(str(text).lower()) if w not in STOPWORDS and len(w) > 1]


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def similarity_name(a: Optional[str], b: Optional[str]) -> float:
    """Token overlap blended with string similarity."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    overlap = len(set(ta) & set(tb)) / max(1, len(set(ta) | set(tb)))
    fuzzy = _ratio(" ".join(ta), " ".join(tb))
    return min(1.0, 0.55 * overlap + 0.45 * fuzzy)


def similarity_description(a: Optional[str], b: Optional[str]) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    stop = len(set(ta) & set(tb))
    jaccard = stop / max(1, len(set(ta) | set(tb)))
    containment = stop / max(1, min(len(set(ta)), len(set(tb))))
    return min(1.0, 0.6 * containment + 0.4 * jaccard)


def _colour_family(value: Optional[str]) -> Optional[str]:
    text = (value or "").lower().strip()
    if not text:
        return None
    for family, members in COLOUR_SYNONYMS.items():
        for member in members:
            if member in text:
                return family
    return None


def similarity_colour(a: Optional[str], b: Optional[str]) -> float:
    if not a or not b:
        return 0.4  # neutral when one side is missing
    fa, fb = _colour_family(a), _colour_family(b)
    if fa and fb and fa == fb:
        return 1.0
    if fa and fb:
        # related families
        related = {("black", "grey"), ("brown", "yellow"), ("blue", "green"), ("grey", "white")}
        return 0.55 if (fa, fb) in related or (fb, fa) in related else 0.1
    return 0.7 if _ratio(a.lower(), b.lower()) > 0.7 else 0.3


def similarity_brand(a: Optional[str], b: Optional[str]) -> float:
    ta, tb = (a or "").lower().strip(), (b or "").lower().strip()
    if not ta or not tb:
        return 0.45
    if ta == tb:
        return 1.0
    if ta in tb or tb in ta:
        return 0.85
    for canon, aliases in BRAND_ALIASES.items():
        in_a = any(alias in ta for alias in aliases)
        in_b = any(alias in tb for alias in aliases)
        if in_a and in_b:
            return 0.95
    return 0.2 if _ratio(ta, tb) < 0.65 else 0.6


def similarity_location(a: Optional[str], b: Optional[str]) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.4
    shared = set(ta) & set(tb)
    if shared:
        base = len(shared) / max(1, min(len(set(ta)), len(set(tb))))
        return min(1.0, 0.55 + 0.45 * base)
    fuzzy = _ratio(" ".join(ta), " ".join(tb))
    return max(0.1, min(0.6, fuzzy))


def _to_datetime(d: Any, t: Any) -> Optional[datetime]:
    if not d:
        return None
    if isinstance(d, datetime):
        base = d
    elif isinstance(d, date):
        base = datetime.combine(d, time(12, 0))
    else:
        try:
            base = datetime.fromisoformat(str(d)[:10])
        except ValueError:
            return None
    if isinstance(t, timedelta):
        base = base.replace(hour=0, minute=0) + t
    elif isinstance(t, time):
        base = datetime.combine(base.date(), t)
    return base


def similarity_datetime(
    lost_date: Any, lost_time: Any, found_date: Any, found_time: Any
) -> Tuple[float, Optional[float]]:
    lost = _to_datetime(lost_date, lost_time)
    found = _to_datetime(found_date, found_time)
    if not lost or not found:
        return 0.4, None
    hours = (found - lost).total_seconds() / 3600.0
    if hours < -36:  # found long before it was lost is implausible
        return 0.05, hours
    gap = abs(hours)
    if gap <= 2:
        score = 1.0
    elif gap <= 12:
        score = 0.85
    elif gap <= 24:
        score = 0.7
    elif gap <= 72:
        score = 0.5
    elif gap <= 168:
        score = 0.3
    else:
        score = 0.12
    return score, round(hours, 2)


def similarity_category(lost: Dict[str, Any], found: Dict[str, Any]) -> float:
    if lost.get("category_id") and found.get("category_id"):
        if lost["category_id"] == found["category_id"]:
            return 1.0
        if lost.get("category_name") and lost.get("category_name") == found.get("category_name"):
            return 1.0
        return 0.15
    name_a, name_b = lost.get("category_name"), found.get("category_name")
    if name_a and name_b:
        return 1.0 if name_a == name_b else 0.2
    return 0.4


def score_pair(lost: Dict[str, Any], found: Dict[str, Any]) -> Dict[str, Any]:
    dt_score, gap_hours = similarity_datetime(
        lost.get("incident_date"), lost.get("incident_time"),
        found.get("incident_date"), found.get("incident_time"),
    )
    parts = {
        "category": similarity_category(lost, found),
        "name": similarity_name(lost.get("title"), found.get("title")),
        "description": similarity_description(lost.get("description"), found.get("description")),
        "colour": similarity_colour(lost.get("colour"), found.get("colour")),
        "brand": similarity_brand(lost.get("brand"), found.get("brand")),
        "location": similarity_location(
            lost.get("location_text") or lost.get("location_name"),
            found.get("location_text") or found.get("location_name"),
        ),
        "datetime": dt_score,
    }
    breakdown = {
        key: {
            "weight": WEIGHTS[key],
            "similarity": round(value, 4),
            "points": round(value * WEIGHTS[key], 2),
        }
        for key, value in parts.items()
    }
    total = round(sum(item["points"] for item in breakdown.values()), 2)
    total = max(0.0, min(100.0, total))

    reasons: List[str] = []
    if parts["category"] >= 0.9:
        reasons.append("Same category")
    if parts["name"] >= 0.6:
        reasons.append("Similar item name")
    if parts["description"] >= 0.55:
        reasons.append("Description keywords overlap")
    if parts["colour"] >= 0.9:
        reasons.append("Colour family matches")
    if parts["brand"] >= 0.85:
        reasons.append("Brand matches")
    if parts["location"] >= 0.7:
        reasons.append("Location matches")
    if gap_hours is not None and abs(gap_hours) <= 24:
        reasons.append(f"Times are within {int(abs(gap_hours))}h")

    return {
        "score": total,
        "breakdown": breakdown,
        "reasons": reasons,
        "gap_hours": gap_hours,
    }


def confidence_for(score: float, high: float = 75.0, medium: float = 55.0) -> str:
    if score >= high:
        return "high"
    if score >= medium:
        return "medium"
    return "low"


def rank_candidates(
    target: Dict[str, Any],
    candidates: Iterable[Dict[str, Any]],
    high: float = 75.0,
    medium: float = 55.0,
    minimum: float = 35.0,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    results = []
    for candidate in candidates:
        scored = score_pair(target, candidate)
        if scored["score"] < minimum:
            continue
        scored["report"] = candidate
        scored["confidence"] = confidence_for(scored["score"], high, medium)
        results.append(scored)
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:limit]
