from __future__ import annotations

import json
import logging
import os
import time
import asyncio
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from math import ceil
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.classifier import classify, prewarm_keyword_cache
from backend.i18n import copy_for, resolve_response_language
from backend.prealert import build_prealert
from backend.ranking import DATA_DIR, load_capability_registry, load_taxonomy, rank_hospitals
from backend.schemas import (
    DepartmentBed,
    EmergencyNumbers,
    EmergencyResult,
    EmergencyType,
    Hospital,
    HospitalBedsUpdateRequest,
    TriageRequest,
    TriageResponse,
    VoiceTranscriptionResponse,
)
from backend.voice import InvalidAudioError, VoiceUnavailableError, inspect_audio, transcribe_audio
from backend.nearby import router as nearby_router


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("sahayai.api")
HOSPITALS_PATH = Path(os.getenv("HOSPITALS_PATH", str(DATA_DIR / "hospitals.json")))
ONLY_VERIFIED = os.getenv("ONLY_VERIFIED", "false").strip().lower() == "true"
AMBULANCE_DIRECTORY_PATH = Path(
    os.getenv("AMBULANCE_DIRECTORY_PATH", str(DATA_DIR / "mysuru_ambulance_providers.json"))
)
RATE_LIMIT_REQUESTS = max(1, int(os.getenv("TRIAGE_RATE_LIMIT_REQUESTS", "30")))
RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("TRIAGE_RATE_LIMIT_WINDOW_SECONDS", "60")))
VOICE_RATE_LIMIT_REQUESTS = max(1, int(os.getenv("VOICE_RATE_LIMIT_REQUESTS", "10")))
VOICE_RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("VOICE_RATE_LIMIT_WINDOW_SECONDS", "60")))
MAX_AUDIO_UPLOAD_BYTES = max(1024, int(os.getenv("VOICE_MAX_AUDIO_BYTES", str(10 * 1024 * 1024))))
_triage_request_times: dict[str, deque[float]] = defaultdict(deque)
_voice_request_times: dict[str, deque[float]] = defaultdict(deque)
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
app.include_router(nearby_router)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "*").strip()
if frontend_origin == "*" or not frontend_origin:
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in frontend_origin.split(",") if origin.strip()]
    for default_origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        if default_origin not in allowed_origins:
            allowed_origins.append(default_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def limit_triage_requests(request: Request, call_next):
    """Basic per-process abuse guard for the public text and audio endpoints."""
    if request.method == "POST" and (
        request.url.path in {"/api/triage", "/api/voice/transcribe"}
        or request.url.path.startswith("/api/nearby/")
    ):
        is_voice = request.url.path == "/api/voice/transcribe"
        request_times = _voice_request_times if is_voice else _triage_request_times
        limit = VOICE_RATE_LIMIT_REQUESTS if is_voice else RATE_LIMIT_REQUESTS
        window_seconds = VOICE_RATE_LIMIT_WINDOW_SECONDS if is_voice else RATE_LIMIT_WINDOW_SECONDS
        # Use the socket peer, not an untrusted forwarded header. Configure a
        # trusted proxy/rate-limit service for deployments behind a load balancer.
        path_bucket = "/api/nearby" if request.url.path.startswith("/api/nearby/") else request.url.path
        client_key = f"{request.client.host if request.client else 'unknown'}:{path_bucket}"
        now = time.monotonic()
        cutoff = now - window_seconds
        with _rate_limit_lock:
            # Bound stale client state when the service sees many one-off IPs.
            if len(request_times) > 1024:
                for key, stale_bucket in list(request_times.items()):
                    while stale_bucket and stale_bucket[0] <= cutoff:
                        stale_bucket.popleft()
                    if not stale_bucket:
                        request_times.pop(key, None)
            bucket = request_times[client_key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, ceil(window_seconds - (now - bucket[0])))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Try again soon. Call 108 for urgent help."},
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


@app.get("/api/ambulances")
async def get_ambulance_directory() -> dict[str, object]:
    """Return current public-listing candidates, excluding historical contacts/leads."""
    try:
        with AMBULANCE_DIRECTORY_PATH.open("r", encoding="utf-8") as file:
            directory = json.load(file)
        providers = []
        for provider in directory.get("providers", []):
            current_contacts = [
                contact for contact in provider.get("public_contacts", [])
                if contact.get("verification") != "historical_unverified"
                and not str(contact.get("number_type", "")).startswith("historical_")
            ]
            providers.append({
                "provider_id": provider.get("provider_id"),
                "name": provider.get("name"),
                "provider_type": provider.get("provider_type"),
                "record_status": provider.get("record_status"),
                "public_contacts": current_contacts,
                "address_or_service_location": provider.get("address_or_service_location"),
                "public_listing_notes": provider.get("public_listing_notes"),
                "evidence_label": provider.get("evidence_label"),
                "source_ids": provider.get("source_ids", []),
            })
        networks = [
            {
                "network_id": network.get("network_id"),
                "name": network.get("name"),
                "public_contacts": network.get("public_contacts", []),
                "operating_model_note": network.get("operating_model_note"),
                "source_ids": network.get("source_ids", []),
            }
            for network in directory.get("networks_or_aggregators", [])
        ]
        return {
            "dataset_name": directory.get("dataset_name"),
            "generated_on": directory.get("generated_on"),
            "geography": directory.get("geography"),
            "dataset_type": directory.get("dataset_type"),
            "summary": directory.get("summary", {}),
            "important_caveats": directory.get("important_caveats", []),
            "providers": providers,
            "networks_or_aggregators": networks,
            "sources": directory.get("sources", []),
        }
    except Exception as exc:
        logger.error("Ambulance directory unavailable (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Private ambulance directory is unavailable.") from exc


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

    is_unrecognized = (
        emergency.type == EmergencyType.GENERAL_UNCLEAR
        and not emergency.red_flags
        and emergency.confidence == 0.0
    )

    if is_unrecognized:
        recommendation = None
        alternatives = []
        no_full_match = False
        warnings = [copy["unrecognized_phrase"]]
        pre_alert_text = ""
        unverified_results = []
        unlocated_count = 0
    else:
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
        pre_alert_text = build_prealert(request.text, emergency, recommendation, response_language)

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    logger.info("Triage completed: classifier=%s language=%s cached=%s ms=%d", classifier, response_language, cached, elapsed_ms)
    return TriageResponse(
        emergency=EmergencyResult(**emergency.model_dump()),
        recommendation=recommendation,
        alternatives=alternatives,
        pre_alert_text=pre_alert_text,
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


@app.post("/api/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    request: Request,
    language: str = Query(default="auto", pattern="^(auto|en|hi|kn)$"),
) -> VoiceTranscriptionResponse:
    """Transcribe a short raw audio request body; audio is never persisted."""
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    allowed_content_types = {
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/x-m4a",
        "application/octet-stream",
    }
    if content_type not in allowed_content_types:
        raise HTTPException(status_code=415, detail="Upload a supported audio recording.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_AUDIO_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Recording is too large. Try a shorter clip.")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid content length.") from exc

    audio_chunks: list[bytes] = []
    received_bytes = 0
    async for chunk in request.stream():
        received_bytes += len(chunk)
        if received_bytes > MAX_AUDIO_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Recording is too large. Try a shorter clip.")
        audio_chunks.append(chunk)
    audio_bytes = b"".join(audio_chunks)
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="The recording was empty. Please record again or type your message.")

    try:
        duration_seconds = await asyncio.to_thread(inspect_audio, audio_bytes)
        result = await asyncio.to_thread(transcribe_audio, audio_bytes, language, duration_seconds)
    except InvalidAudioError as exc:
        raise HTTPException(status_code=422, detail=f"{exc}. Please record again or type your message.") from exc
    except VoiceUnavailableError as exc:
        logger.warning("Voice transcription unavailable (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Voice transcription is unavailable right now. Please type your message instead.",
        ) from exc

    return VoiceTranscriptionResponse(**result)


@app.get("/api/admin/hospitals")
async def get_admin_hospitals(request: Request):
    """List all hospitals with summary bed counts and department details for staff admin."""
    hospitals: list[Hospital] = request.app.state.hospitals
    result = []
    for h in hospitals:
        total_beds = sum(d.total for d in h.department_beds)
        available_beds = sum(d.available for d in h.department_beds)
        result.append(
            {
                "id": h.id,
                "name": h.name,
                "type": h.type,
                "address": h.address or "",
                "phone": h.phone or "",
                "total_beds": total_beds,
                "available_beds": available_beds,
                "department_beds": [d.model_dump() for d in h.department_beds],
            }
        )
    return {"hospitals": result}


@app.get("/api/admin/hospitals/{hospital_id}/beds")
async def get_hospital_beds(hospital_id: str, request: Request):
    """Retrieve current department bed counts for a specific hospital."""
    hospitals: list[Hospital] = request.app.state.hospitals
    hospital = next((h for h in hospitals if h.id == hospital_id), None)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    total_beds = sum(d.total for d in hospital.department_beds)
    available_beds = sum(d.available for d in hospital.department_beds)
    return {
        "hospital_id": hospital.id,
        "hospital_name": hospital.name,
        "total_beds": total_beds,
        "available_beds": available_beds,
        "department_beds": [d.model_dump() for d in hospital.department_beds],
    }


@app.put("/api/admin/hospitals/{hospital_id}/beds")
async def update_hospital_beds(
    hospital_id: str,
    payload: HospitalBedsUpdateRequest,
    request: Request,
):
    """Allow hospital staff to update live bed availability for their hospital departments."""
    hospitals: list[Hospital] = request.app.state.hospitals
    hospital = next((h for h in hospitals if h.id == hospital_id), None)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated_beds: list[DepartmentBed] = []
    for bed in payload.department_beds:
        if bed.available > bed.total:
            raise HTTPException(
                status_code=422,
                detail=f"Available beds ({bed.available}) cannot exceed total beds ({bed.total}) for {bed.department_name}",
            )
        updated_beds.append(
            DepartmentBed(
                department_id=bed.department_id,
                department_name=bed.department_name,
                total=bed.total,
                available=bed.available,
                last_updated=now_iso,
            )
        )

    hospital.department_beds = updated_beds

    # Persist updated hospitals data to file
    try:
        raw_data = [h.model_dump() for h in hospitals]
        temp_path = HOSPITALS_PATH.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as f:
            json.dump(raw_data, f, indent=2, ensure_ascii=False)
        temp_path.replace(HOSPITALS_PATH)
    except Exception as exc:
        logger.exception("Failed to persist updated hospital bed data")
        raise HTTPException(status_code=500, detail="Failed to persist bed updates") from exc

    total_beds = sum(d.total for d in hospital.department_beds)
    available_beds = sum(d.available for d in hospital.department_beds)
    logger.info(
        "Updated live beds for %s (%s): %d/%d available (by %s)",
        hospital.name,
        hospital.id,
        available_beds,
        total_beds,
        payload.updated_by or "staff",
    )
    return {
        "success": True,
        "hospital_id": hospital.id,
        "hospital_name": hospital.name,
        "total_beds": total_beds,
        "available_beds": available_beds,
        "department_beds": [d.model_dump() for d in hospital.department_beds],
        "updated_at": now_iso,
    }


@app.get("/SANJEEVANI_PROJECT_GUIDE.pdf")
@app.get("/api/download-guide-pdf")
async def download_project_guide_pdf():
    """Serve the complete project guide, architecture, and defense document as a downloadable PDF."""
    pdf_path = Path(__file__).resolve().parents[1] / "SANJEEVANI_PROJECT_GUIDE.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF guide not found")
    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename="SANJEEVANI_PROJECT_GUIDE.pdf",
    )


