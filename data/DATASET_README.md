# SahayAI Mysuru Hospital Dataset - Integration Pack

Dataset reviewed: 2026-10-30
Records: 23 hospital / hospital-branch candidates. 17 have approximate coordinates; 6 need a confirmed map pin. 17 have approximate coordinates; 6 need a confirmed map pin.

## Included files

- `data/hospitals.json` - backend-ready JSON array.
- `data/emergency_types.json` - emergency-to-capability mapping updated for static service data.
- `data/capability_registry.json` - original and extended capability tags.
- `backend/hospital_loader.py` - JSON loader and coordinate-safe distance helper.
- `SahayAI_Hospital_Database_Reference.docx` - human-readable research catalogue.

## Important data integrity rules

1. **All records have `verified: false`.** These are public-source research records, not direct confirmation from each hospital. Do not change this field to `true` until a teammate confirms the hospital, branch, address, contact and capability by phone or another authoritative route.
2. `research_checked_on` is when public pages were reviewed. It is **not** the same as `last_verified`; `last_verified` is intentionally `null`.
3. `lat` and `lng` are approximate third-party map coordinates and `location_verified` is `false`. Some records have `null` coordinates. Do not geocode by guessing. Confirm exact branch pins before production.
4. Missing capabilities are not claims that a hospital lacks them. A capability is included only when a public source explicitly supports it. A missing tag means unknown / not established in this research.
5. `blood_storage_centre` is not interchangeable with `blood_bank`.
6. `snake_bite_management` is not the same as current anti-snake venom stock. No current medicine stock is included.
9. `emergency_department` means an emergency service is listed but 24/7 operation was not clearly established in the source reviewed; do not treat it as `emergency_24x7`.
7. `burns_care` is not the same as a dedicated `burns_unit`.
8. Some entries (e.g. KR Hospital, Cheluvamba, Kamakshi group) are research candidates with incomplete branch/service detail. Read each record's `notes` before enabling it in emergency recommendations.

## Copy into your project

Copy:

- `data/hospitals.json` -> your repo `data/hospitals.json`
- `data/emergency_types.json` -> your repo `data/emergency_types.json`

Copy `backend/hospital_loader.py` into your `backend/` directory, or adapt the validation logic to your existing loader. This package does not overwrite your existing FastAPI application code because the backend source files were not supplied in this chat.

## Minimal FastAPI startup integration

```python
from pathlib import Path
import os
from backend.hospital_loader import load_hospitals

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HOSPITALS = load_hospitals(
    DATA_DIR / "hospitals.json",
    only_verified=os.getenv("ONLY_VERIFIED", "false").lower() == "true",
)
```

If this file is located under `backend/main.py`, adjust `DATA_DIR` only if your repository layout differs.

## Update your Pydantic schema

Your old brief only describes the original fields. Add optional metadata fields and arrays:

```python
from typing import Optional
from pydantic import BaseModel, Field

class Hospital(BaseModel):
    id: str
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    type: str
    capabilities: list[str] = Field(default_factory=list)
    departments: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    diagnostics: list[str] = Field(default_factory=list)
    source: Optional[str] = None
    source_urls: list[str] = Field(default_factory=list)
    last_verified: Optional[str] = None
    research_checked_on: Optional[str] = None
    verified_by: Optional[str] = None
    verified: bool = False
    location_verified: bool = False
    notes: str = ""
```

## Ranking integration notes

- Use `capabilities` for deterministic matching; `departments`, `services`, and `diagnostics` are explanatory/searchable metadata.
- Update snake-bite requirements: do not require `anti_venom` because this database does not track current anti-venom stock. Use `emergency_24x7` as required and score `icu`, `snake_bite_management`, and `ventilator` as preferred capabilities.
- For poisoning, use `poisoning_management` and/or `toxicology_poison` as preferred tags; do not infer antidote stock.
- For burns, distinguish dedicated `burns_unit` from broad `burns_care`.
- Do not equate `blood_storage_centre` with `blood_bank`.
- Do not calculate Haversine distance when `lat` or `lng` is null. Keep those records out of GPS proximity ranking until geocoded, but they may remain in an admin/research view.
- Show a visible “Public information - not hospital verified” label while `verified` is false.
- For the hackathon demo only, `ONLY_VERIFIED=false` allows the dataset to load with an unverified badge. For a real deployment, require verified records.

## Data refresh and review

Review official source links periodically. Before setting `verified=true`, a teammate should confirm:

- Exact hospital branch and address.
- Current contact number and emergency number.
- Each specific capability tag (not just a broad speciality name).
- Whether services are available at that campus, rather than another branch in the same group.
- Date, verification method and verifier name.

Never represent a public service list as live stock, live beds, current doctor availability or guaranteed acceptance of a particular patient.
