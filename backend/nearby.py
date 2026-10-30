"""Short-lived, consent-based nearby helper alerts for the hackathon demo.

This is a community-help feature, not an emergency dispatch service. It stores
only a category and coordinates for a short TTL; raw triage text is never sent.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import math
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("sahayai.nearby")
RADIUS_M = 500
REQUEST_TTL_SECONDS = 10 * 60
HELPER_TTL_SECONDS = 15 * 60
LOCATION_FRESH_SECONDS = 3 * 60
MAX_PUSH_RECIPIENTS = 50
DB_PATH = Path(os.getenv("NEARBY_DB_PATH", ".data/nearby.sqlite3"))

Category = Literal[
    "poisoning_ingestion", "burns", "snake_bite", "cardiac", "stroke",
    "trauma_accident", "severe_bleeding", "obstetric", "pediatric_emergency",
    "breathing_difficulty", "seizure", "allergic_reaction",
    "electric_shock_drowning", "minor_injury_fracture", "general_unclear",
]


class PushSubscription(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)
    expirationTime: int | None = None
    keys: dict[str, str]


class LocationBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RequestHelpBody(LocationBody):
    category: Category
    consent: bool


class ClaimBody(LocationBody):
    pass


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _allowed_push_endpoint(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    try:
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or port not in (None, 443):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        return host == "fcm.googleapis.com" or any(host == domain or host.endswith("." + domain) for domain in (
            "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.services.microsoft.com"
        ))


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rad = math.pi / 180
    dlat, dlng = (lat2 - lat1) * rad, (lng2 - lng1) * rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlng / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0, 1 - a)))


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10, isolation_level="IMMEDIATE")
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS helpers (
                token_hash TEXT PRIMARY KEY,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                available_until REAL,
                last_lat REAL,
                last_lng REAL,
                last_location_at REAL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS help_requests (
                id TEXT PRIMARY KEY,
                requester_hash TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                claimed_by TEXT,
                claimed_at REAL
            );
            CREATE INDEX IF NOT EXISTS helper_expiry_idx ON helpers(available_until, last_location_at);
            CREATE INDEX IF NOT EXISTS request_expiry_idx ON help_requests(expires_at, status);
        """)
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _cleanup(conn: sqlite3.Connection, now: float) -> None:
    conn.execute("DELETE FROM helpers WHERE created_at < ? OR (available_until IS NOT NULL AND available_until < ?)", (now - 30 * 86400, now - 86400))
    conn.execute("UPDATE help_requests SET status='expired',lat=0,lng=0,category='general_unclear' WHERE status='open' AND expires_at <= ?", (now,))
    conn.execute("DELETE FROM help_requests WHERE expires_at < ?", (now - 86400,))


def _bearer(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Helper session is required.")
    return authorization[7:].strip()


def _helper_token(token: str = Depends(_bearer)) -> tuple[str, sqlite3.Row]:
    token_hash = _token_hash(token)
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        row = conn.execute("SELECT * FROM helpers WHERE token_hash=?", (token_hash,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Helper session expired. Register again.")
    return token_hash, row


router = APIRouter(prefix="/api/nearby", tags=["nearby-help"])


@router.get("/config")
def nearby_config() -> dict[str, object]:
    public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    configured = bool(public_key and os.getenv("VAPID_PRIVATE_KEY") and os.getenv("VAPID_SUBJECT", "").startswith("mailto:"))
    return {"enabled": configured, "radius_m": RADIUS_M, "request_ttl_seconds": REQUEST_TTL_SECONDS, "helper_ttl_seconds": HELPER_TTL_SECONDS, "vapid_public_key": public_key if configured else None}


@router.post("/helpers/register")
def register_helper(subscription: PushSubscription) -> dict[str, str]:
    if not os.getenv("VAPID_PUBLIC_KEY"):
        raise HTTPException(status_code=503, detail="Nearby alerts are not configured yet.")
    if not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT", "").startswith("mailto:"):
        raise HTTPException(status_code=503, detail="Push delivery is not configured yet.")
    key_p = subscription.keys.get("p256dh", "")
    key_a = subscription.keys.get("auth", "")
    if not _allowed_push_endpoint(subscription.endpoint):
        raise HTTPException(status_code=422, detail="Push service endpoint is not supported.")
    if not key_p or not key_a:
        raise HTTPException(status_code=422, detail="Push subscription is missing encryption keys.")
    now = time.time()
    raw_token = secrets.token_urlsafe(32)
    with _db() as conn:
        _cleanup(conn, now)
        token_hash = _token_hash(raw_token)
        conn.execute("""INSERT INTO helpers(token_hash,endpoint,p256dh,auth,created_at)
            VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET token_hash=excluded.token_hash, p256dh=excluded.p256dh, auth=excluded.auth, available_until=NULL, last_lat=NULL, last_lng=NULL, last_location_at=NULL""",
            (token_hash, subscription.endpoint, key_p, key_a, now))
    return {"helper_token": raw_token}


@router.post("/helpers/availability")
def set_helper_availability(body: LocationBody, helper: tuple[str, sqlite3.Row] = Depends(_helper_token)) -> dict[str, object]:
    token_hash, _ = helper
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        conn.execute("UPDATE helpers SET last_lat=?,last_lng=?,last_location_at=?,available_until=? WHERE token_hash=?",
                     (body.lat, body.lng, now, now + HELPER_TTL_SECONDS, token_hash))
    return {"available": True, "available_until": int(now + HELPER_TTL_SECONDS), "location_fresh_seconds": LOCATION_FRESH_SECONDS}


@router.post("/helpers/stop")
def stop_helper(helper: tuple[str, sqlite3.Row] = Depends(_helper_token)) -> dict[str, bool]:
    with _db() as conn:
        conn.execute("UPDATE helpers SET available_until=NULL,last_lat=NULL,last_lng=NULL,last_location_at=NULL WHERE token_hash=?", (helper[0],))
    return {"available": False}


def _send_push(row: sqlite3.Row, request_id: str) -> bool:
    try:
        from pywebpush import WebPushException, webpush
        payload = json.dumps({"title": "Someone nearby may need help", "body": "Open SahayAI to see the request. Exact location is shared only after you accept.", "data": {"url": f"/?nearbyRequest={request_id}"}})
        webpush(subscription_info={"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}},
                data=payload, vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                vapid_claims={"sub": os.environ["VAPID_SUBJECT"]}, ttl=300)
        return True
    except Exception as exc:
        logger.info("Nearby push could not be delivered (%s)", type(exc).__name__)
        if "WebPushException" in type(exc).__name__ and getattr(exc, "response", None) is not None and exc.response.status_code in (404, 410):
            with _db() as conn:
                conn.execute("DELETE FROM helpers WHERE endpoint=?", (row["endpoint"],))
        return False


@router.post("/requests", status_code=201)
def create_help_request(body: RequestHelpBody, background_tasks: BackgroundTasks) -> dict[str, object]:
    if not body.consent:
        raise HTTPException(status_code=400, detail="Explicit location-sharing consent is required.")
    if not os.getenv("VAPID_PUBLIC_KEY"):
        raise HTTPException(status_code=503, detail="Nearby alerts are not configured yet. Call 108 or 112 for emergency help.")
    now = time.time()
    request_id = str(uuid.uuid4())
    requester_token = secrets.token_urlsafe(32)
    requester_hash = _token_hash(requester_token)
    with _db() as conn:
        _cleanup(conn, now)
        conn.execute("INSERT INTO help_requests(id,requester_hash,lat,lng,category,status,created_at,expires_at) VALUES(?,?,?,?,?,'open',?,?)",
                     (request_id, requester_hash, body.lat, body.lng, body.category, now, now + REQUEST_TTL_SECONDS))
        candidates = conn.execute("""SELECT * FROM helpers WHERE available_until>? AND last_location_at>? 
            AND last_lat IS NOT NULL AND last_lng IS NOT NULL ORDER BY last_location_at DESC""",+                                  (now, now - LOCATION_FRESH_SECONDS)).fetchall()
    nearby = [row for row in candidates if _distance_m(body.lat, body.lng, row["last_lat"], row["last_lng"]) <= RADIUS_M][:MAX_PUSH_RECIPIENTS]
    for row in nearby:
        background_tasks.add_task(_send_push, dict(row), request_id)
    return {"request_id": request_id, "requester_token": requester_token, "status": "open", "alerts_queued": len(nearby),
            "radius_m": RADIUS_M, "expires_at": int(now + REQUEST_TTL_SECONDS),
            "message": "If someone accepts, their response will appear here. Keep 108 or 112 available for urgent help."}


@router.get("/requests/{request_id}")
def get_help_request(request_id: str, authorization: str | None = Header(default=None)) -> dict[str, object]:
    token = _bearer(authorization)
    token_hash = _token_hash(token)
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        row = conn.execute("SELECT * FROM help_requests WHERE id=?", (request_id,)).fetchone()
    if row is None or (row["requester_hash"] != token_hash and row["claimed_by"] != token_hash):
        raise HTTPException(status_code=404, detail="Request not found or no longer available.")
    result: dict[str, object] = {"request_id": request_id, "status": row["status"], "category": row["category"], "expires_at": int(row["expires_at"])}
    if row["status"] == "claimed":
        result["helper_accepted"] = True
    return result


@router.post("/requests/{request_id}/claim")
def claim_help_request(request_id: str, body: ClaimBody, helper: tuple[str, sqlite3.Row] = Depends(_helper_token)) -> dict[str, object]:
    helper_hash = helper[0]
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        person = conn.execute("SELECT * FROM helpers WHERE token_hash=?", (helper_hash,)).fetchone()
        if person is None or person["available_until"] is None or person["available_until"] <= now:
            raise HTTPException(status_code=403, detail="Turn on helper availability before accepting.")
        if person["last_location_at"] is None or now - person["last_location_at"] > LOCATION_FRESH_SECONDS:
            raise HTTPException(status_code=403, detail="Refresh your location before accepting.")
        row = conn.execute("SELECT * FROM help_requests WHERE id=?", (request_id,)).fetchone()
        if row is None or row["status"] != "open" or row["expires_at"] <= now:
            raise HTTPException(status_code=409, detail="This request has already closed.")
        if _distance_m(body.lat, body.lng, row["lat"], row["lng"]) > RADIUS_M:
            raise HTTPException(status_code=403, detail="You are outside the 500 m request area.")
        updated = conn.execute("UPDATE help_requests SET status='claimed',claimed_by=?,claimed_at=?,lat=0,lng=0,category='general_unclear' WHERE id=? AND status='open' AND expires_at>?",
                               (helper_hash, now, request_id, now))
        if updated.rowcount != 1:
            raise HTTPException(status_code=409, detail="Someone else has already accepted this request.")
        conn.execute("UPDATE helpers SET available_until=NULL,last_lat=NULL,last_lng=NULL,last_location_at=NULL WHERE token_hash=?", (helper_hash,))
        category, lat, lng = row["category"], row["lat"], row["lng"]
    return {"request_id": request_id, "status": "claimed", "category": category, "requester_location": {"lat": lat, "lng": lng},
            "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={lat:.6f}%2C{lng:.6f}&travelmode=walking"}


@router.post("/requests/{request_id}/cancel")
def cancel_help_request(request_id: str, authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = _bearer(authorization)
    now = time.time()
    with _db() as conn:
        row = conn.execute("SELECT requester_hash,status FROM help_requests WHERE id=?", (request_id,)).fetchone()
        if row is None or row["requester_hash"] != _token_hash(token):
            raise HTTPException(status_code=404, detail="Request not found.")
        if row["status"] == "claimed":
            raise HTTPException(status_code=409, detail="A helper has already accepted; call 108 or 112 for emergency services.")
        conn.execute("UPDATE help_requests SET status='cancelled',lat=0,lng=0,category='general_unclear' WHERE id=? AND status='open'", (request_id,))
    return {"request_id": request_id, "status": "cancelled"}

