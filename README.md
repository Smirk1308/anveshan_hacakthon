# SahayAI

SahayAI helps a bystander find a nearby hospital that may match an emergency's care requirements. **Call 108 first in an emergency.** The app does not diagnose or provide treatment advice.

This workspace currently contains the patient-facing Next.js frontend. The backend is a separate FastAPI service per `PROJECT_BRIEF.md`. When the API is not configured or cannot be reached, the frontend uses synthetic sample records clearly marked as unverified; call and navigation actions stay disabled for those records. Backend public-source records are also presented as unverified until the hospital confirms the details.

## Run on Windows

Requirements: Node.js 20.9 or newer, npm, and PowerShell. No database or Python installation is needed to run the frontend demo.

```powershell
cd "C:\Users\Akash\Documents\ChatGPT\Anvaya Hackathon"
npm ci
Copy-Item .env.frontend.example .env.local
npm run dev
```

Open <http://localhost:3000>. The browser may ask for location permission. If permission is denied or unavailable, choose an approximate Mysuru area from the picker. Approximate location selection is only suitable for this synthetic demo.

## Connect the FastAPI backend

Set `NEXT_PUBLIC_TRIAGE_API_URL` in `.env.local` to the backend origin, then restart the frontend:

```dotenv
NEXT_PUBLIC_TRIAGE_API_URL=http://localhost:8000
```

The backend must expose `POST /api/triage` with the request and response contract in `PROJECT_BRIEF.md`, and allow `http://localhost:3000` through CORS. The frontend validates responses with Zod and sends the chosen language. If the service is unreachable or returns an invalid response, the page falls back to synthetic demo data and displays a warning.

Never place Gemini, Groq, or other private API keys in a `NEXT_PUBLIC_*` variable or in frontend code. Those keys belong only in the FastAPI service's server-side environment.

## Useful commands

```powershell
npm run dev           # local development server
npm run build         # production build
npm run start         # serve a production build
npm run test:contract # contract verification tests
npm run typecheck     # TypeScript validation
npm run lint          # ESLint
npm run format:check  # Prettier validation
```

## Frontend structure

```text
src/
  app/                         Next.js App Router entry and global styles
  features/patient/             Patient-facing emergency finder
    components/                 Responsive UI components
    lib/                        API adapter, Zod contracts, and UI translations
data/demo-hospitals.json        Synthetic unverified UI fixtures
```

The hospital fixtures are not real facilities. Replace them only with records that teammates have verified by hand. Keep `verified: false` for fixtures; the frontend intentionally disables calls, directions, and pre-alert actions for unverified records. Do not present sample availability as live.

The hero uses a local SVG poster with a restrained CSS location animation by default. To add an optional short loop, put an optimized `.webm` or `.mp4` file in `public/`, set `NEXT_PUBLIC_HERO_VIDEO_URL=/your-loop.webm` in `.env.local`, and restart Next.js. The loop is muted, starts only when reduced motion is not requested, and falls back to the poster otherwise.

## Location and privacy

Browser geolocation works on `localhost` or HTTPS. The UI requests one foreground location fix, offers a manual approximate-area picker, and does not save the query or location in browser storage. A configured backend receives the emergency text and coordinates for the current triage request. If the backend has a hosted language model configured, emergency text may also be sent to that model provider for classification. Confirm retention and provider settings against the backend environment before using real patient information. The frontend stores neither values in browser storage. Phone calls and navigation appear only when the backend explicitly provides the corresponding URL and marks the hospital or its location verified.

## Nearby community help and Web Push

Nearby community help is an opt-in peer-volunteer feature within 500 m. It is **not** an emergency dispatch service; call 108 or 112 first.

- **Requirements**: Served over HTTPS (or `localhost`), with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` set in the backend environment.
- **iOS Web Push**: Requires iOS 16.4+ and adding the app to the Home Screen from Safari (`manifest.webmanifest` and `/sw.js` are provided).
- **Explicit Consent & GPS**: Only live GPS-backed locations can trigger a nearby request; approximate or manual locations cannot be used. Requesters must explicitly check the consent box to share coordinates and emergency category for up to 10 minutes.
- **Privacy**: Push notifications are generic and never contain personal details, full triage text, or exact pins. Exact requester coordinates and walking directions are unlocked to a volunteer helper only after the backend confirms an atomic claim within 500 m.
- **Helper Availability**: Volunteer availability lasts up to 15 minutes and requires a fresh location within 3 minutes; helpers should keep the tab open while available. Helpers can stop sharing availability at any time.
