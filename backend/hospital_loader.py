"""Load and validate SahayAI hospital data.

Copy this module into backend/hospital_loader.py. It intentionally does not
mark public-source records as verified. Coordinates may be null; ranking code
must skip distance calculations when either coordinate is unavailable.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any

REQUIRED = {"id", "name", "type", "capabilities", "verified"}
ALLOWED_TYPES = {"government", "private", "trust"}


def load_hospitals(path: str | Path, *, only_verified: bool = False) -> list[dict[str, Any]]:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Hospital dataset not found: {file_path}")
    with file_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if isinstance(payload, dict):
        rows = payload.get("records")
    else:
        rows = payload
    if not isinstance(rows, list):
        raise ValueError("Hospital dataset must be a JSON array or an object with a 'records' array")

    seen: set[str] = set()
    clean: list[dict[str, Any]] = []
    for index, hospital in enumerate(rows):
        if not isinstance(hospital, dict):
            raise ValueError(f"Hospital record at index {index} is not an object")
        missing = REQUIRED - hospital.keys()
        if missing:
            raise ValueError(f"Hospital record at index {index} is missing fields: {sorted(missing)}")
        hid = str(hospital["id"]).strip()
        if not hid or hid in seen:
            raise ValueError(f"Hospital id is blank or duplicated: {hid!r}")
        seen.add(hid)
        if hospital["type"] not in ALLOWED_TYPES:
            raise ValueError(f"Invalid hospital type for {hid}: {hospital['type']!r}")
        if not isinstance(hospital["capabilities"], list):
            raise ValueError(f"capabilities must be a list for {hid}")
        lat, lng = hospital.get("lat"), hospital.get("lng")
        if (lat is None) != (lng is None):
            raise ValueError(f"Both lat and lng must be supplied together for {hid}")
        if lat is not None and not (-90 <= float(lat) <= 90 and -180 <= float(lng) <= 180):
            raise ValueError(f"Invalid coordinates for {hid}")
        for field in ("departments", "services", "diagnostics", "capabilities", "source_urls"):
            if field in hospital and not isinstance(hospital[field], list):
                raise ValueError(f"{field} must be a list for {hid}")
        if only_verified and hospital.get("verified") is not True:
            continue
        clean.append(hospital)
    return clean


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance in km. Call only after checking coords."""
    from math import radians, sin, cos, asin, sqrt
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(a))


def hospitals_with_location(hospitals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """For proximity ranking, use records with coordinates only."""
    return [h for h in hospitals if h.get("lat") is not None and h.get("lng") is not None]
