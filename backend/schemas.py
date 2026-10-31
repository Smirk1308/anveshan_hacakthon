from __future__ import annotations

from enum import Enum
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Language(str, Enum):
    AUTO = "auto"
    ENGLISH = "en"
    HINDI = "hi"
    KANNADA = "kn"


class LocationSource(str, Enum):
    GPS = "gps"
    MANUAL = "manual"


class EmergencyType(str, Enum):
    POISONING_INGESTION = "poisoning_ingestion"
    BURNS = "burns"
    SNAKE_BITE = "snake_bite"
    CARDIAC = "cardiac"
    STROKE = "stroke"
    TRAUMA_ACCIDENT = "trauma_accident"
    SEVERE_BLEEDING = "severe_bleeding"
    OBSTETRIC = "obstetric"
    PEDIATRIC_EMERGENCY = "pediatric_emergency"
    BREATHING_DIFFICULTY = "breathing_difficulty"
    SEIZURE = "seizure"
    ALLERGIC_REACTION = "allergic_reaction"
    ELECTRIC_SHOCK_DROWNING = "electric_shock_drowning"
    MINOR_INJURY_FRACTURE = "minor_injury_fracture"
    GENERAL_UNCLEAR = "general_unclear"


class Severity(str, Enum):
    CRITICAL = "critical"
    SERIOUS = "serious"
    MODERATE = "moderate"
    UNCLEAR = "unclear"


class Classification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EmergencyType
    severity: Severity
    age_group: Literal["child", "teen", "adult", "elderly", "unknown"] = "unknown"
    red_flags: list[str] = Field(default_factory=list)
    summary: str = Field(min_length=1, max_length=240)
    confidence: float = Field(ge=0, le=1)
    input_language: Literal["en", "hi", "kn", "mixed"]


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=500)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    location_source: LocationSource
    # `auto` detects English, Hindi, Kannada, and common Roman-script phrases.
    language: Language = Language.AUTO

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value

    @field_validator("language", mode="before")
    @classmethod
    def normalize_language_name(cls, value: object) -> object:
        if isinstance(value, str):
            aliases = {"english": "en", "hindi": "hi", "kannada": "kn", "automatic": "auto"}
            return aliases.get(value.strip().lower(), value.strip().lower())
        return value


class VoiceTranscriptionResponse(BaseModel):
    """Transcript returned by the optional speech-to-text endpoint."""

    text: str = Field(min_length=1, max_length=500)
    language: Literal["en", "hi", "kn"]
    duration_seconds: float = Field(ge=0, le=20)


class DepartmentBed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department_id: str
    department_name: str
    total: int = Field(ge=0)
    available: int = Field(ge=0)
    last_updated: str | None = None


class HospitalBedsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department_beds: list[DepartmentBed]
    updated_by: str | None = None


class Hospital(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = None
    phone: str | None = None
    type: Literal["government", "private", "trust", "sample"] = "sample"
    capabilities: list[str] = Field(default_factory=list)
    departments: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    diagnostics: list[str] = Field(default_factory=list)
    department_beds: list[DepartmentBed] = Field(default_factory=list)
    last_verified: str | None = None
    research_checked_on: str | None = None
    verified_by: str | None = None
    source: str | None = None
    source_urls: list[str] = Field(default_factory=list)
    source_kind: str | None = None
    verified: bool = False
    location_verified: bool = False
    location_source_url: str | None = None
    notes: str = ""

    @model_validator(mode="after")
    def validate_record_integrity(self) -> "Hospital":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must both be provided or both be null")
        if self.location_verified and (self.lat is None or self.lng is None):
            raise ValueError("location_verified requires coordinates")
        if self.verified:
            if not self.phone or not self.address or not self.last_verified or not self.verified_by or not (self.source or self.source_urls):
                raise ValueError("Verified hospitals require address, phone, last_verified, verified_by, and source")
            try:
                date.fromisoformat(self.last_verified)
            except ValueError as exc:
                raise ValueError("last_verified must use YYYY-MM-DD") from exc
        return self


class EmergencyNumbers(BaseModel):
    ambulance: str = "108"
    unified: str = "112"


class EmergencyResult(BaseModel):
    type: EmergencyType
    severity: Severity
    age_group: str
    red_flags: list[str]
    summary: str
    confidence: float
    input_language: str


class HospitalResult(BaseModel):
    id: str
    name: str
    # Frontend Zod contract expects display strings. Convert unknown values to "".
    phone: str
    address: str
    lat: float
    lng: float
    type: str
    capabilities: list[str]
    departments: list[str]
    services: list[str]
    diagnostics: list[str]
    source: str | None
    source_urls: list[str]
    source_kind: str | None
    verified: bool
    last_verified: str
    research_checked_on: str | None
    location_verified: bool
    location_source_url: str | None
    distance_km: float
    eta_min_approx: int
    reasons: list[str]
    matched_required: list[str]
    matched_preferred: list[str]
    missing_preferred: list[str]
    department_beds: list[DepartmentBed] = Field(default_factory=list)
    directions_url: str | None
    call_url: str | None


class TriageResponse(BaseModel):
    emergency: EmergencyResult
    recommendation: HospitalResult | None
    alternatives: list[HospitalResult]
    pre_alert_text: str
    emergency_numbers: EmergencyNumbers = Field(default_factory=EmergencyNumbers)
    warnings: list[str] = Field(default_factory=list)
    ui_copy: dict[str, str]
    meta: dict[str, str | int | bool | None]
