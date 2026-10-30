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

## Provider behavior

The keyword path is always tried first. If it cannot classify the input, one structured model request is made only when exactly one `LLM_PROVIDER` is configured and `LLM_ALLOW_USER_TEXT_SHARING=true`. The model receives the emergency description, not the user's coordinates. Otherwise, the backend uses the safe `general_unclear` fallback. A provider error, timeout, or invalid response also falls back; it does not try another provider in the same request. Raw emergency text and coordinates are not written to backend logs or persisted by this API. No model is allowed to generate diagnosis, treatment, medicine, or first-aid advice.

## Abuse controls and integration contract

- `POST /api/triage` is limited per client IP using an in-memory sliding window. Defaults are 30 requests per 60 seconds; override with `TRIAGE_RATE_LIMIT_REQUESTS` and `TRIAGE_RATE_LIMIT_WINDOW_SECONDS`.
- This limiter is per process and is a basic hackathon safeguard, not a production distributed rate limiter. Behind a reverse proxy, the socket peer may be the proxy; configure a trusted shared rate-limiting layer before public deployment. The endpoint remains unauthenticated so emergency use is not blocked by account creation.
- Triage responses omit nullable action URLs and normalize missing phone, address, and `last_verified` display values to empty strings to match the frontend's current Zod contract. Call URLs still require hospital verification; directions still require both hospital and location verification.
- The backend returns translated `ui_copy` for `en`, `hi`, or `kn`. The frontend must render it and add a language selector if users need to choose a language explicitly.

## Data status

The hospital records and emergency taxonomy are from the [`codex/data-gathering` branch](https://github.com/Smirk1308/anveshan_hacakthon/tree/codex/data-gathering), snapshot commit `1476cf5509bef04f22096fc040d89ed1f97d27ba`. That dataset contains 23 public-source hospital candidates; all 23 have `verified: false`, 17 have approximate coordinates, and 6 have no coordinates. Public-source research is not direct hospital confirmation.

- `research_checked_on` is a research date, not `last_verified`.
- Missing capability tags mean unknown/not established, not unavailable.
- `emergency_department` is not equivalent to confirmed `emergency_24x7`.
- `snake_bite_management` does not establish current antivenom stock.
- Records with null coordinates are omitted from distance ranking.
- Call links require a hospital-verified record; navigation also requires a confirmed location pin. Until those checks are done, the API returns contact/source details and visible public-data warnings but no call/navigation URLs.
- `ONLY_VERIFIED=true` currently excludes all 23 records. Use `false` only for the clearly labeled hackathon demo; do not present the research list as hospital-verified or current availability.

The data source notes and schema are in `data/DATASET_README.md`, `data/hospital_record_schema.json`, and `data/capability_registry.json`. Confirm each branch, address, contact, service, and location with the hospital before changing `verified` or `location_verified` to `true`.
