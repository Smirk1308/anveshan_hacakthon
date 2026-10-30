# SahayAI

SahayAI helps a bystander find a nearby hospital that may match an emergency's care requirements. **Call 108 first in an emergency.** The app does not diagnose or provide treatment advice.

This workspace currently contains the patient-facing Next.js frontend. The backend is a separate FastAPI service per `PROJECT_BRIEF.md`. When the API is not configured or cannot be reached, the frontend uses synthetic sample records clearly marked as unverified; call and navigation actions stay disabled for those records.

## Run on Windows

Requirements: Node.js 24 LTS or newer supported Node.js 20.9+ release, npm, and PowerShell. No database or Python installation is needed to run the frontend demo.

```powershell
cd "C:\Users\Akash\Documents\ChatGPT\Anvaya Hackathon"
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. The browser may ask for location permission. If permission is denied or unavailable, choose an approximate Mysuru area from the picker. Approximate location selection is only suitable for this synthetic demo.

## Connect the FastAPI backend

Set `NEXT_PUBLIC_TRIAGE_API_URL` in `.env.local` to the backend origin, then restart the frontend:

```dotenv
NEXT_PUBLIC_TRIAGE_API_URL=http://localhost:8000
```

The backend must expose `POST /api/triage` with the request and response contract in `PROJECT_BRIEF.md`, and allow `http://localhost:3000` through CORS. The frontend validates the response with Zod. If the service is unreachable or returns an invalid response, the page falls back to synthetic demo data and displays a warning.

Never place Gemini, Groq, or other private API keys in a `NEXT_PUBLIC_*` variable or in frontend code. Those keys belong only in the FastAPI service's server-side environment.

## Useful commands

```powershell
npm run dev          # local development server
npm run build        # production build
npm run start        # serve a production build
npm run typecheck    # TypeScript validation
npm run lint         # ESLint
npm run format:check # Prettier validation
```

## Frontend structure

```text
src/
  app/                         Next.js App Router entry and global styles
  features/patient/             Patient-facing emergency finder
    components/                 Responsive UI components
    lib/                        API adapter and Zod contracts
data/hospitals.json             Synthetic unverified UI fixtures
```

The hospital fixtures are not real facilities. Replace them only with records that teammates have verified by hand. Keep `verified: false` for fixtures; the frontend intentionally disables calls, maps and pre-alert actions for unverified records. Do not present sample availability as live.

## Location and privacy

Browser geolocation works on `localhost` or HTTPS. The UI requests one foreground location fix, offers a manual approximate-area picker, and does not save the query or location in browser storage. A configured backend receives the query and coordinates for the current triage request; backend retention must follow the project brief. Phone links are `tel:` links and may require a phone-capable device.
