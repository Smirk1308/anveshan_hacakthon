# SahayAI triage API contract

This is the shared `POST /api/triage` contract for `codex/backend` and `codex/sahayai-frontend`. It follows the backend Pydantic response models in `backend/schemas.py` and is validated by the frontend Zod schema in `src/features/patient/lib/contracts.ts`.

## Request

The request contains `text` (1–500 characters), `lat`, `lng`, and `location_source` (`gps` or `manual`). `language` is optional and accepts `auto`, `en`, `hi`, or `kn`; the backend defaults it to `auto`.

```json
{
  "text": "My father has chest pain and sweating.",
  "lat": 12.2958,
  "lng": 76.6394,
  "location_source": "manual",
  "language": "en"
}
```

## Optional voice transcription

Voice input is an audio-to-text step; the normal triage response remains text.

Send a raw recording to `POST /api/voice/transcribe?language=auto|en|hi|kn` with an audio `Content-Type` such as `audio/webm`. Do not use multipart form data. Clips are limited to 20 seconds and 10 MiB by default.

The response is:

```json
{
  "text": "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ",
  "language": "kn",
  "duration_seconds": 3.2
}
```

Show the transcript in the emergency-description field for review and editing. Only after the user confirms it, send the text to the existing `POST /api/triage` route with the user's selected location and language. Do not call speech recognition providers directly from the browser or store the raw audio. Handle 413 (too large), 415 (unsupported media type), 422 (empty/unrecognized or unsupported-language audio), and 503 (transcription unavailable) by offering retry or typed input. No API key is required for the local transcription endpoint.

## Response shape

`recommendation` is either `null` or a flat hospital-result object. Each entry in `alternatives` has the same flat shape. Hospital fields such as `id`, `name`, `phone`, `address`, `verified`, and `location_verified` are direct properties of the result. There is no `hospital` wrapper object.

```json
{
  "emergency": {
    "type": "cardiac",
    "severity": "critical",
    "age_group": "adult",
    "red_flags": ["chest_pain"],
    "summary": "Possible cardiac emergency reported.",
    "confidence": 0.91,
    "input_language": "en"
  },
  "recommendation": {
    "id": "hospital-id",
    "name": "Hospital name",
    "phone": "",
    "address": "Mysuru, Karnataka",
    "lat": 12.302,
    "lng": 76.645,
    "type": "government",
    "capabilities": ["emergency_24x7", "cardiology"],
    "departments": ["cardiology"],
    "services": [],
    "diagnostics": [],
    "source": "Public information",
    "source_urls": [],
    "source_kind": "public",
    "verified": false,
    "last_verified": "",
    "research_checked_on": "2026-10-29",
    "location_verified": false,
    "location_source_url": null,
    "distance_km": 2.4,
    "eta_min_approx": 7,
    "reasons": ["cardiology", "2.4 km away"],
    "matched_required": ["emergency_24x7"],
    "matched_preferred": ["cardiology"],
    "missing_preferred": [],
    "directions_url": "https://www.google.com/maps/dir/?api=1&origin=12.295800%2C76.639400&destination=12.302000%2C76.645000&travelmode=driving",
    "call_url": null
  },
  "alternatives": [],
  "pre_alert_text": "EMERGENCY PRE-ALERT…",
  "emergency_numbers": { "ambulance": "108", "unified": "112" },
  "warnings": [],
  "ui_copy": {
    "response_language": "en",
    "emergency_banner": "This sounds life-threatening. Call 108 now.",
    "disclaimer": "This service does not diagnose or give medical advice.",
    "capabilities_note": "Unlisted capabilities are unknown, not unavailable.",
    "actions_unavailable": "Calls and directions are withheld until verified."
  },
  "meta": {
    "classifier": "keyword",
    "provider": "none",
    "latency_ms": 12,
    "cached": false
  }
}
```

Hospital result fields are `id`, `name`, `phone`, `address`, `lat`, `lng`, `type`, `capabilities`, `departments`, `services`, `diagnostics`, nullable `source`, `source_urls`, nullable `source_kind`, `verified`, `last_verified`, nullable `research_checked_on`, `location_verified`, nullable `location_source_url`, `distance_km`, `eta_min_approx`, `reasons`, `matched_required`, `matched_preferred`, `missing_preferred`, nullable `directions_url`, and nullable `call_url`. The current backend emits `""` for unknown `phone`, `address`, and `last_verified` display values; nullable research/source fields remain `null` when unknown.

The backend serializes unavailable action URLs as `null`. The frontend also tolerates omitted action URL properties. Directions URLs are returned whenever a hospital record has coordinates, including records whose hospital or pin verification flags are false, to keep the hackathon demo navigable. The frontend only enables the directions action after the user shares GPS or explicitly selects an area, and keeps unverified destinations visibly marked as approximate. Changing the selected location clears prior results so a stale origin cannot be used. Hospital calling remains enabled only when `verified` is true and `call_url` is present. The demo fallback uses the same Google Maps URL format with the user’s selected origin and sample destination.

Hospital records from public sources remain unverified until confirmed by the hospital. `research_checked_on` is not a hospital verification date. Missing capability tags mean unknown, not unavailable.

## Nearby community-help alerts

Nearby help is an opt-in community feature, not emergency dispatch. The browser must be served over HTTPS (localhost is allowed during development), and each helper must explicitly enable notifications and location. The feature is available only when VAPID push keys are configured by the backend.

The requester explicitly agrees before sharing live GPS and an emergency category. Free-text triage, name, phone, and exact coordinates are never included in a push payload. A push notification is generic. The helper must open the app, share a fresh location, and accept while within 500 m. Only then does the API return the requester's exact pin and a Google Maps walking route. Requests expire after 10 minutes; helper availability expires after 15 minutes and location must be refreshed within 3 minutes. Push delivery is best effort, so keep 108/112 visible.

Routes:

- `GET /api/nearby/config` returns feature availability, the VAPID public key, 500 m radius, and TTL values.
- `POST /api/nearby/helpers/register` stores a browser PushSubscription and returns an opaque helper bearer token.
- `POST /api/nearby/helpers/availability` accepts `{ "lat": number, "lng": number }` with `Authorization: Bearer <helper_token>` and starts/renews 15-minute availability.
- `POST /api/nearby/helpers/stop` clears the helper's location and availability.
- `POST /api/nearby/requests` accepts `{ "lat": number, "lng": number, "category": EmergencyType, "consent": true }` and returns `request_id`, a requester bearer token, expiry, and `alerts_queued` (candidate push attempts queued for background delivery, not confirmed receipt). The database stores no free-text description.
- `GET /api/nearby/requests/{request_id}` with the requester bearer token returns status only; after claim it confirms acceptance without exposing helper identity.
- `POST /api/nearby/requests/{request_id}/claim` accepts a helper's fresh `lat/lng`; a single atomic claim succeeds only for an available helper within 500 m. The response then includes the exact requester pin and route.
- `POST /api/nearby/requests/{request_id}/cancel` with the requester bearer token closes an open request.

The current hackathon storage is local SQLite at `.data/nearby.sqlite3` (ignored by Git). It is suitable for one backend process; multiple replicas need shared Postgres storage and a distributed rate limiter. Browser push subscriptions and opaque bearer tokens are sensitive credentials. Configure HTTPS, keep the VAPID private key server-side, and rotate the database and push credentials if exposed. iOS web push requires the site to be installed to the Home Screen on supported iOS versions; notification permission must follow a user action.

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (PEM path or PEM text), and `VAPID_SUBJECT=mailto:...` on the backend. Generate the key pair with `vapid --gen` and obtain the browser key with `vapid --applicationServerKey`. Never commit the private key.

## Contract verification

Run `npm run test:contract` on the frontend branch. The test passes a serialized flat backend response through the same `requestTriage` adapter used by the UI, verifies it is returned with `demo: false`, and renders the hospital card to check that backend data is shown. It also checks nullable and omitted action URLs.
