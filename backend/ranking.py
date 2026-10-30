from __future__ import annotations

import json
import math
import re
from pathlib import Path
from urllib.parse import urlencode

from backend.i18n import capability_label, copy_for
from backend.schemas import Classification, EmergencyType, Hospital, HospitalResult, Severity


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
EARTH_RADIUS_KM = 6371.0088
MAX_DISTANCE_KM = 30.0
AVERAGE_SPEED_KMH = 25.0


def load_taxonomy(path: Path = DATA_DIR / "emergency_types.json") -> dict[str, dict[str, list[str]]]:
    with path.open("r", encoding="utf-8") as file:
        taxonomy = json.load(file)
    if not isinstance(taxonomy, dict) or not taxonomy:
        raise ValueError("Emergency taxonomy must be a non-empty JSON object")
    expected = {emergency.value for emergency in EmergencyType}
    missing = expected - set(taxonomy)
    if missing:
        raise ValueError(f"Emergency taxonomy is missing categories: {', '.join(sorted(missing))}")
    for name, spec in taxonomy.items():
        if not isinstance(spec, dict) or any(not isinstance(spec.get(key), list) for key in ("required", "preferred")):
            raise ValueError(f"Invalid required/preferred capability lists for {name}")
        if any(not isinstance(capability, str) for key in ("required", "preferred") for capability in spec[key]):
            raise ValueError(f"Capability tags must be strings for {name}")
    return taxonomy


def load_capability_registry(path: Path = DATA_DIR / "capability_registry.json") -> set[str]:
    with path.open("r", encoding="utf-8") as file:
        registry = json.load(file)
    capabilities = set(registry.get("base_capabilities", [])) | set(registry.get("extended_capabilities", []))
    if not capabilities or any(not isinstance(item, str) for item in capabilities):
        raise ValueError("Capability registry must contain string capability tags")
    return capabilities


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(delta_lng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def _dial_string(phone: str | None) -> str | None:
    if not phone:
        return None
    first_number = re.split(r"[;,|/]", phone, maxsplit=1)[0]
    digits = re.sub(r"\D", "", first_number)
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return None


def _directions_url(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> str:
    params = urlencode({
        "api": "1",
        "origin": f"{origin_lat:.6f},{origin_lng:.6f}",
        "destination": f"{dest_lat:.6f},{dest_lng:.6f}",
        "travelmode": "driving",
    })
    return f"https://www.google.com/maps/dir/?{params}"


def _build_result(
    hospital: Hospital,
    distance: float,
    emergency: Classification,
    required: list[str],
    preferred: list[str],
    user_lat: float,
    user_lng: float,
    language: str,
) -> tuple[HospitalResult, float]:
    caps = set(hospital.capabilities)
    matched_required = [cap for cap in required if cap in caps]
    matched_preferred = [cap for cap in preferred if cap in caps]
    missing_preferred = [cap for cap in preferred if cap not in caps]
    preferred_fraction = len(matched_preferred) / len(preferred) if preferred else 1.0
    distance_score = max(0.0, 1.0 - distance / 25.0)
    cap_weight, distance_weight = (0.4, 0.6) if emergency.severity == Severity.CRITICAL else (0.6, 0.4)
    score = cap_weight * preferred_fraction + distance_weight * distance_score
    labels = copy_for(language)
    reasons = [capability_label(cap, language) for cap in matched_required + matched_preferred]
    reasons.append(f"{distance:.1f} {labels['km']}")
    dial_string = _dial_string(hospital.phone)
    result = HospitalResult(
        id=hospital.id,
        name=hospital.name,
        phone=hospital.phone or "",
        address=hospital.address or "",
        lat=hospital.lat,
        lng=hospital.lng,
        type=hospital.type,
        capabilities=hospital.capabilities,
        departments=hospital.departments,
        services=hospital.services,
        diagnostics=hospital.diagnostics,
        source=hospital.source,
        source_urls=hospital.source_urls,
        source_kind=hospital.source_kind,
        verified=hospital.verified,
        last_verified=hospital.last_verified or "",
        research_checked_on=hospital.research_checked_on,
        location_verified=hospital.location_verified,
        location_source_url=hospital.location_source_url,
        distance_km=round(distance, 1),
        eta_min_approx=max(1, round(distance / AVERAGE_SPEED_KMH * 60)),
        reasons=reasons,
        matched_required=matched_required,
        matched_preferred=matched_preferred,
        missing_preferred=missing_preferred,
        # Directions may use approximate public-source pins for the hackathon demo.
        # The UI gates the link on the user's location being shared/selected and
        # continues to label an unverified hospital location as approximate.
        directions_url=(
            _directions_url(user_lat, user_lng, hospital.lat, hospital.lng)
            if hospital.lat is not None and hospital.lng is not None
            else None
        ),
        call_url=f"tel:{dial_string}" if dial_string else None,
    )
    return result, score


def rank_hospitals(
    emergency: Classification,
    hospitals: list[Hospital],
    taxonomy: dict[str, dict[str, list[str]]],
    user_lat: float,
    user_lng: float,
    language: str,
) -> tuple[HospitalResult | None, list[HospitalResult], bool]:
    spec = taxonomy.get(emergency.type.value, taxonomy["general_unclear"])
    required = list(spec["required"])
    preferred = list(spec["preferred"])
    if emergency.age_group == "child":
        if "paediatrics" not in preferred and "paediatrics" not in required:
            preferred.append("paediatrics")
        if emergency.severity in {Severity.CRITICAL, Severity.SERIOUS} and "picu" not in preferred:
            preferred.append("picu")

    nearby: list[tuple[Hospital, float]] = []
    for hospital in hospitals:
        if hospital.lat is None or hospital.lng is None:
            continue
        distance = haversine_km(user_lat, user_lng, hospital.lat, hospital.lng)
        if distance <= MAX_DISTANCE_KM:
            nearby.append((hospital, distance))
    qualifying = [(h, d) for h, d in nearby if set(required).issubset(h.capabilities)]
    no_full_match = not qualifying
    candidates = qualifying
    if no_full_match:
        candidates = [(h, d) for h, d in nearby if "emergency_24x7" in h.capabilities]
        candidates.sort(key=lambda item: item[1])
        results = [_build_result(h, d, emergency, required, preferred, user_lat, user_lng, language)[0] for h, d in candidates]
    else:
        scored = [_build_result(h, d, emergency, required, preferred, user_lat, user_lng, language) for h, d in candidates]
        scored.sort(key=lambda item: item[1], reverse=True)
        results = [item[0] for item in scored]
    return (results[0] if results else None, results[1:3], no_full_match)
