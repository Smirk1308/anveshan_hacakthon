from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from math import ceil
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.classifier import classify, prewarm_keyword_cache
from backend.i18n import copy_for, resolve_response_language
from backend.prealert import build_prealert
from backend.ranking import DATA_DIR, load_capability_registry, load_taxonomy, rank_hospitals
from backend.schemas import EmergencyNumbers, EmergencyResult, Hospital, TriageRequest, TriageResponse


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("sahayai.api")
HOSPITALS_PATH = Path(os.getenv("HOSPITALS_PATH", str(DATA_DIR / "hospitals.json")))
ONLY_VERIFIED = os.getenv("ONLY_VERIFIED", "false").strip().lower() == "true"
RATE_LIMIT_REQUESTS = max(1, int(os.getenv("TRIAGE_RATE_LIMIT_REQUESTS", "30")))
RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("TRIAGE_RATE_LIMIT_WINDOW_SECONDS", "60")))
_triage_request_times: dict[str, deque[float]] = defaultdict(deque)
_rate_limit_lock = Lock()


def load_hospitals(path: Path = HOSPITALS_PATH) -> list[Hospital]:
    try:
        allowed_capabilities = load_capability_registry()
        with path.open("r", encoding="utf-8") as file:
            raw = json.load(file)
        if not isinstance(raw, list):
            raise ValueError("Hospital data must be a JSON array")
        hospitals = [Hospital.model_validate(item) for item in raw]
        for hospital in hospitals:
            unknown = set(hospital.capabilities) - allowed_capabilities
            if unknown:
                raise ValueError(f"Unknown capability tag in {hospital.id}: {', '.join(sorted(unknown))}")
        ids = [hospital.id for hospital in hospitals]
        if len(ids) != len(set(ids)):
            raise ValueError("Hospital IDs must be unique")
        if ONLY_VERIFIED:
            hospitals = [hospital for hospital in hospitals if hospital.verified]
        return hospitals
    except Exception as exc:
        logger.exception("Hospital data could not be loaded or validated")
        raise RuntimeError(f"Hospital data is invalid: {type(exc).__name__}") from exc


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.taxonomy = load_taxonomy()
    app.state.hospitals = load_hospitals()
    app.state.verified_count = sum(hospital.verified for hospital in app.state.hospitals)
    app.state.located_count = sum(hospital.lat is not None and hospital.lng is not None for hospital in app.state.hospitals)
    app.state.location_verified_count = sum(hospital.location_verified for hospital in app.state.hospitals)
    prewarm_keyword_cache()
    logger.info("Backend ready: %d hospital records (%d verified)", len(app.state.hospitals), app.state.verified_count)
    yield


app = FastAPI(
    title="Emergency Hospital Finder API",
    version="0.1.0",
    description="Capability-first emergency hospital matching. Not a medical advice or diagnosis service.",
    lifespan=lifespan,
)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").strip()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origin.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def limit_triage_requests(request: Request, call_next):
    """Basic per-process abuse guard for the public triage endpoint."""
    if request.method == "POST" and request.url.path == "/api/triage":
        # Use the socket peer, not an untrusted forwarded header. Configure a
        # trusted proxy/rate-limit service for deployments behind a load balancer.
        client_key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        cutoff = now - RATE_LIMIT_WINDOW_SECONDS
        with _rate_limit_lock:
            # Bound stale client state when the service sees many one-off IPs.
            if len(_triage_request_times) > 1024:
                for key, bucket in list(_triage_request_times.items()):
                    while bucket and bucket[0] <= cutoff:
                        bucket.popleft()
                    if not bucket:
                        _triage_request_times.pop(key, None)
            bucket = _triage_request_times[client_key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= RATE_LIMIT_REQUESTS:
                retry_after = max(1, ceil(RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many triage requests. Try again soon. Call 108 for urgent help."},
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)
    return await call_next(request)


@app.get("/api/health")
async def health() -> dict[str, int | str | bool]:
    hospitals = getattr(app.state, "hospitals", [])
    verified_count = getattr(app.state, "verified_count", 0)
    return {
        "status": "ok",
        "hospitals_loaded": len(hospitals),
        "verified_count": verified_count,
        "unverified_count": len(hospitals) - verified_count,
        "with_coordinates_count": getattr(app.state, "located_count", 0),
        "location_verified_count": getattr(app.state, "location_verified_count", 0),
    }


@app.get("/api/hospitals")
async def get_hospitals() -> dict[str, object]:
    return {"hospitals": [hospital.model_dump() for hospital in app.state.hospitals]}


@app.post("/api/triage", response_model=TriageResponse, response_model_exclude_none=True)
async def triage(request: TriageRequest) -> TriageResponse:
    started = time.perf_counter()
    try:
        emergency, classifier, cached, detected_language, provider = await classify(request.text, request.language)
    except Exception as exc:
        # Unexpected classification errors never expose internals or user text.
        logger.error("Classification failed safely (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Classification is temporarily unavailable. Call 108 for urgent help.") from exc

    response_language = resolve_response_language(request.language, detected_language)
    copy = copy_for(response_language)
    recommendation, alternatives, no_full_match = rank_hospitals(
        emergency=emergency,
        hospitals=app.state.hospitals,
        taxonomy=app.state.taxonomy,
        user_lat=request.lat,
        user_lng=request.lng,
        language=response_language,
    )
    warnings: list[str] = []
    if classifier == "fallback":
        warnings.append(copy["fallback_warning"])
    if no_full_match:
        warnings.append(copy["no_match_warning"] if recommendation else copy["no_hospitals_warning"])
    if recommendation:
        warnings.append(copy["approximation"])
    unverified_results = [item for item in ([recommendation] if recommendation else []) + alternatives if not item.verified]
    if unverified_results:
        warnings.append(copy["public_data_warning"])
    if recommendation and not recommendation.location_verified:
        warnings.append(copy["approx_location_warning"])
    unlocated_count = len(app.state.hospitals) - getattr(app.state, "located_count", 0)
    if unlocated_count:
        warnings.append(copy["locations_missing_warning"].format(count=unlocated_count))

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    logger.info("Triage completed: classifier=%s language=%s cached=%s ms=%d", classifier, response_language, cached, elapsed_ms)
    return TriageResponse(
        emergency=EmergencyResult(**emergency.model_dump()),
        recommendation=recommendation,
        alternatives=alternatives,
        pre_alert_text=build_prealert(request.text, emergency, recommendation, response_language),
        emergency_numbers=EmergencyNumbers(),
        warnings=warnings,
        ui_copy={
            "response_language": response_language,
            "emergency_banner": copy["emergency_banner"],
            "disclaimer": copy["disclaimer"],
            "capabilities_note": copy["capabilities_note"],
            "actions_unavailable": copy["actions_unavailable"],
        },
        meta={
            "classifier": classifier,
            "provider": provider,
            "latency_ms": elapsed_ms,
            "cached": cached,
            "location_source": request.location_source.value,
            "response_language": response_language,
            "unverified_result_count": len(unverified_results),
            "hospitals_without_coordinates": unlocated_count,
        },
    )
