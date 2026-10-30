# Backend handoff

## Start locally

From the repository root:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

The API is available at `http://localhost:8000`; OpenAPI docs are at `/docs`.
Copy `.env.example` to `.env`. Multilingual keyword matching and the safe fallback work without a provider. LLM classification is disabled by default; to enable it, select one provider and set `LLM_ALLOW_USER_TEXT_SHARING=true` after the team has chosen to send emergency text to that provider.

## Frontend language contract

Send `language` as `auto`, `en`, `hi`, or `kn` in `POST /api/triage`. `auto` detects Devanagari/Kannada script and common Roman Hindi/Kannada phrases; users can explicitly choose a language to control response copy. Stable machine tags such as `emergency.type`, `red_flags`, and capability arrays stay language-neutral. `ui_copy`, `warnings`, `reasons`, category summaries, and pre-alert templates use the selected/detected language. The user-provided situation text is preserved in the copyable pre-alert, but is not written to logs or disk.

Request:

```json
{
  "text": "ನನ್ನ ತಂದೆಗೆ ಹಾವು ಕಚ್ಚಿದೆ",
  "lat": 12.2958,
  "lng": 76.6394,
  "location_source": "manual",
  "language": "kn"
}
```

Routes:

- `GET /api/health`: liveness and dataset counts.
- `GET /api/hospitals`: loaded records for frontend/demo inspection.
- `POST /api/triage`: language-aware classification, capability-first ranking, and pre-alert.
- `POST /api/voice/transcribe?language=auto|en|hi|kn`: optional local transcription of a raw audio request body. It returns a transcript and detected language; submit the reviewed transcript to `/api/triage` as ordinary text.

## Optional voice transcription

Voice transcription uses local `faster-whisper` speech recognition. Install it separately so the base backend remains lightweight:

```powershell
pip install -r requirements-voice.txt
```

The default multilingual `small` model works with English, Hindi, and Kannada. `VOICE_DEVICE=auto` tries CUDA and falls back to CPU int8 if CUDA cannot initialize. On an RTX 3050 with 6 GB VRAM, start with this model; `medium` and larger models need more memory. The model weights download the first time the endpoint is used, so make a warm-up recording before a demo. CUDA acceleration requires the NVIDIA libraries documented by faster-whisper; CPU fallback remains available if those are missing.

The endpoint accepts raw audio bytes (not multipart form data) with a supported `Content-Type`, such as `audio/webm`, plus a `language` query parameter. Maximum clip duration is 20 seconds and maximum upload size defaults to 10 MiB. Configure the byte limit and per-client in-memory rate limit with `VOICE_MAX_AUDIO_BYTES`, `VOICE_RATE_LIMIT_REQUESTS`, and `VOICE_RATE_LIMIT_WINDOW_SECONDS`. It returns `{ "text": "...", "language": "en|hi|kn", "duration_seconds": 3.2 }`. Invalid or silent clips return 422; if the optional speech runtime is missing or unavailable, it returns 503 so the frontend can fall back to typed input.

Audio is held in memory for transcription and is not written to disk or included in logs. The endpoint does not generate triage or medical advice; the frontend must let the user review the transcript and then call the existing `/api/triage` route. The audio endpoint has its own basic per-process rate limit; use shared rate limiting before public deployment.

## Provider behavior

The keyword path is always tried first. If it cannot classify the input, one structured model request is made only when exactly one `LLM_PROVIDER` is configured and `LLM_ALLOW_USER_TEXT_SHARING=true`. The model receives the emergency description, not the user's coordinates. Otherwise, the backend uses the safe `general_unclear` fallback. A provider error, timeout, or invalid response also falls back; it does not try another provider in the same request. Raw emergency text and coordinates are not written to backend logs or persisted to disk/database by this API. The bounded in-memory classification cache stores a per-process HMAC of normalized text rather than the text itself; cached classifications expire after 30 minutes and at most 256 entries are retained. No model is allowed to generate diagnosis, treatment, medicine, or first-aid advice.

## Classifier evaluation

Run the rule-based evaluation cases with `py -m unittest discover -s tests -v`. Category severity follows the project brief; detected red flags remain separate and trigger the urgent UI banner. In particular, severe bleeding and pediatric emergencies with fits stay `serious`, while a standalone seizure is `critical`. Hindi acid-ingestion examples are included in both Roman Hindi and Devanagari.

## Abuse controls and integration contract

- `POST /api/triage` is limited per client IP using an in-memory sliding window. Defaults are 30 requests per 60 seconds; override with `TRIAGE_RATE_LIMIT_REQUESTS` and `TRIAGE_RATE_LIMIT_WINDOW_SECONDS`.
- This limiter is per process and is a basic hackathon safeguard, not a production distributed rate limiter. Behind a reverse proxy, the socket peer may be the proxy; configure a trusted shared rate-limiting layer before public deployment. The endpoint remains unauthenticated so emergency use is not blocked by account creation.
- Triage responses omit nullable action URLs and normalize missing phone, address, and `last_verified` display values to empty strings to match the frontend's current Zod contract. Call URLs still require hospital verification; directions URLs are returned for coordinate-backed records, while the UI waits for a shared or selected user origin.
- The backend returns translated `ui_copy` for `en`, `hi`, or `kn`. The frontend must render it and add a language selector if users need to choose a language explicitly.

## Data status

The hospital records and emergency taxonomy are from the [`codex/data-gathering` branch](https://github.com/Smirk1308/anveshan_hacakthon/tree/codex/data-gathering), snapshot commit `1476cf5509bef04f22096fc040d89ed1f97d27ba`. That dataset contains 23 public-source hospital candidates; all 23 have `verified: false`, 17 have approximate coordinates, and 6 have no coordinates. Public-source research is not direct hospital confirmation.

- `research_checked_on` is a research date, not `last_verified`.
- Missing capability tags mean unknown/not established, not unavailable.
- `emergency_department` is not equivalent to confirmed `emergency_24x7`.
- `snake_bite_management` does not establish current antivenom stock.
- Records with null coordinates are omitted from distance ranking.
- Call links require a hospital-verified record. Directions links are returned for records with coordinates so the hackathon demo can open Google Maps with the user's origin and the hospital destination prefilled. The frontend only enables directions after GPS is obtained or the user selects an area. Unverified destination pins stay visibly marked as approximate; users should check the destination in Maps before travelling.
- `ONLY_VERIFIED=true` currently excludes all 23 records. Use `false` only for the clearly labeled hackathon demo; do not present the research list as hospital-verified or current availability.

The data source notes and schema are in `data/DATASET_README.md`, `data/hospital_record_schema.json`, and `data/capability_registry.json`. Confirm each branch, address, contact, service, and location with the hospital before changing `verified` or `location_verified` to `true`.
