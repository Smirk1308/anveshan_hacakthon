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

## Contract verification

Run `npm run test:contract` on the frontend branch. The test passes a serialized flat backend response through the same `requestTriage` adapter used by the UI, verifies it is returned with `demo: false`, and renders the hospital card to check that backend data is shown. It also checks nullable and omitted action URLs.
