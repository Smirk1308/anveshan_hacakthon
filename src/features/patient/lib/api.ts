import realHospitalsData from "../../../../data/hospitals.json";
import taxonomyData from "../../../../data/emergency_types.json";
import samples from "../../../../data/demo-hospitals.json";
import {
  HospitalMatch,
  HospitalRecord,
  HospitalSchema,
  Language,
  Location,
  TriageRequestSchema,
  TriageResponse,
} from "./contracts";
import { getUiCopy } from "./ui-copy";
import { requestBackendTriage } from "./triage-client";

const realHospitals: HospitalRecord[] = (realHospitalsData as unknown[]).map(
  (record) => HospitalSchema.parse(record),
);
const sampleHospitals: HospitalRecord[] = (samples as unknown[]).map((record) =>
  HospitalSchema.parse(record),
);

const realHospitalsWithCoords = realHospitals.filter(
  (h): h is HospitalRecord & { lat: number; lng: number } =>
    typeof h.lat === "number" && typeof h.lng === "number",
);
const activeHospitalPool =
  realHospitalsWithCoords.length > 0
    ? realHospitalsWithCoords
    : (sampleHospitals as (HospitalRecord & { lat: number; lng: number })[]);

function demoDirectionsUrl(
  origin: Location,
  hospital: { lat: number; lng: number },
) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set(
    "origin",
    `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`,
  );
  url.searchParams.set(
    "destination",
    `${hospital.lat.toFixed(6)},${hospital.lng.toFixed(6)}`,
  );
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

const emergencyProfiles = [
  {
    type: "poisoning_ingestion",
    patterns: [
      /acid|poison|phenyl|swallowed|drank|vish|ವಿಷ|ವಿಷ ಕುಡಿದ|ज़हर|तेज़ाब/,
    ],
    severity: "critical" as const,
    preferred: ["toxicology_poison", "picu"],
  },
  {
    type: "snake_bite",
    patterns: [/snake|सांप|saap|ಹಾವು|ಹಾವು ಕಚ್ಚ/],
    severity: "critical" as const,
    preferred: ["snake_bite_management", "icu", "ventilator"],
  },
  {
    type: "burns",
    patterns: [/burn|hot oil|fire|जल गया|jal gaya|ಸುಟ್ಟು|ಸುಟ್ಟ/],
    severity: "serious" as const,
    preferred: ["burns_unit", "plastic_surgery", "icu"],
  },
  {
    type: "cardiac",
    patterns: [/chest pain|heart attack|cardiac|सीने में दर्द|ಎದೆ ನೋವು/],
    severity: "critical" as const,
    preferred: ["cardiac_cath_lab", "cardiology"],
  },
  {
    type: "trauma_accident",
    patterns: [/accident|crash|fell from|bike|दुर्घटना|ಅಪಘಾತ/],
    severity: "critical" as const,
    preferred: ["trauma_center", "orthopaedics", "blood_bank"],
  },
  {
    type: "breathing_difficulty",
    patterns: [
      /cannot breathe|can't breathe|not breathing|सांस नहीं|ಉಸಿರಾಡಲು ಆಗುತ್ತಿಲ್ಲ/,
    ],
    severity: "critical" as const,
    preferred: ["ventilator", "icu"],
  },
  {
    type: "seizure",
    patterns: [/seizure|having a fit|fits|दौरा|ಸೆಳೆತ/],
    severity: "serious" as const,
    preferred: ["neurology", "icu"],
  },
];

function haversineKm(origin: Location, dest: { lat: number; lng: number }) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(dest.lat - origin.lat);
  const dLng = radians(dest.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.lat)) *
      Math.cos(radians(dest.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeDemoResponse(
  text: string,
  location: Location,
  language: Language,
  offline = false,
): TriageResponse {
  const normalized = text.toLocaleLowerCase();
  const detectedLanguage = /[\u0900-\u097F]/.test(text)
    ? "hi"
    : /[\u0C80-\u0CFF]/.test(text)
      ? "kn"
      : "en";
  const responseLanguage = language === "auto" ? detectedLanguage : language;
  const copy = getUiCopy(responseLanguage);
  const capabilityLabelMap = copy.capabilityLabels as Record<string, string>;
  const profile = emergencyProfiles.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(normalized)),
  );
  const redFlagPatterns: Record<string, RegExp> = {
    unconscious: /unconscious|behosh|बेहोश|ಪ್ರಜ್ಞೆ ಇಲ್ಲ/,
    not_breathing:
      /not breathing|cannot breathe|can't breathe|सांस नहीं|ಉಸಿರಾಡುತ್ತಿಲ್ಲ/,
    severe_bleeding: /severe bleeding|bleeding a lot|बहुत खून|ತುಂಬಾ ರಕ್ತ/,
    seizure: /seizure|having a fit|fits|दौरा|ಸೆಳೆತ/,
    chest_pain: /chest pain|सीने में दर्द|ಎದೆ ನೋವು/,
  };
  const redFlags = Object.entries(redFlagPatterns)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([flag]) => flag);
  const age =
    /\b(?:under|age)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:year|yr|y\/o)/i.exec(text);
  const ageValue = Number(age?.[1] ?? age?.[2] ?? 0);
  const ageGroup =
    ageValue > 0 && ageValue < 13
      ? "child"
      : ageValue >= 13 && ageValue < 18
        ? "teen"
        : ageValue >= 18 && ageValue < 60
          ? "adult"
          : ageValue >= 60
            ? "elderly"
            : "unknown";

  const profileType = profile?.type ?? "general_unclear";
  const taxonomySpec = (
    taxonomyData as Record<
      string,
      { required?: string[]; preferred?: string[] }
    >
  )[profileType];
  const required = [...(taxonomySpec?.required ?? ["emergency_24x7"])];
  const preferred = [
    ...(taxonomySpec?.preferred ?? profile?.preferred ?? ["icu"]),
  ];

  if (ageGroup === "child") {
    if (
      !preferred.includes("paediatrics") &&
      !required.includes("paediatrics")
    ) {
      preferred.push("paediatrics");
    }
    if (
      (profile?.severity === "critical" || profile?.severity === "serious") &&
      !preferred.includes("picu")
    ) {
      preferred.push("picu");
    }
  }

  const nearby = activeHospitalPool
    .map((hospital) => ({
      hospital,
      distance: haversineKm(location, hospital),
    }))
    .filter((item) => item.distance <= 30.0);

  const qualifying = nearby.filter((item) =>
    required.every((cap) => item.hospital.capabilities.includes(cap)),
  );
  const candidates = qualifying.length > 0 ? qualifying : nearby;

  const capWeight = profile?.severity === "critical" ? 0.4 : 0.6;
  const distWeight = profile?.severity === "critical" ? 0.6 : 0.4;

  const scored = candidates.map((item) => {
    const matchedRequired = required.filter((cap) =>
      item.hospital.capabilities.includes(cap),
    );
    const matchedPreferred = preferred.filter((cap) =>
      item.hospital.capabilities.includes(cap),
    );
    const preferredFraction =
      preferred.length > 0 ? matchedPreferred.length / preferred.length : 1.0;
    const distanceScore = Math.max(0, 1.0 - item.distance / 25.0);
    const score = capWeight * preferredFraction + distWeight * distanceScore;
    return {
      hospital: item.hospital,
      distance: item.distance,
      score,
      matchedRequired,
      matchedPreferred,
      missingPreferred: preferred.filter(
        (cap) => !matchedPreferred.includes(cap),
      ),
    };
  });

  scored.sort((a, b) => b.score - a.score || a.distance - b.distance);
  const ordered = scored.slice(0, 3);

  const matches = ordered.map(
    ({
      hospital,
      distance,
      matchedRequired,
      matchedPreferred,
      missingPreferred,
    }): HospitalMatch => {
      const reasons = [
        ...matchedRequired.map(
          (capability) =>
            capabilityLabelMap[capability] ?? capability.replaceAll("_", " "),
        ),
        ...matchedPreferred.map(
          (capability) =>
            capabilityLabelMap[capability] ?? capability.replaceAll("_", " "),
        ),
        `${distance.toFixed(1)} km`,
      ].slice(0, 3);

      return {
        ...hospital,
        lat: hospital.lat,
        lng: hospital.lng,
        phone: hospital.phone ?? "",
        address: hospital.address ?? "",
        last_verified: hospital.last_verified ?? "",
        directions_url: demoDirectionsUrl(location, hospital),
        call_url: hospital.phone
          ? `tel:${hospital.phone.replace(/[^\d+]/g, "")}`
          : null,
        distance_km: Number(distance.toFixed(1)),
        eta_min_approx: Math.max(1, Math.round((distance / 25) * 60)),
        reasons,
        matched_required: matchedRequired,
        matched_preferred: matchedPreferred,
        missing_preferred: missingPreferred,
      };
    },
  );

  const summary =
    copy.demoSummaries[profileType as keyof typeof copy.demoSummaries] ??
    copy.demoSummaries.general_unclear;
  const isSynthetic = matches.some(
    (m) => m.type === "sample" || m.id.startsWith("sample_"),
  );
  const caution = isSynthetic ? copy.syntheticNotice : copy.publicDataNotice;

  return {
    emergency: {
      type: profileType,
      severity: profile?.severity ?? "unclear",
      age_group: ageGroup,
      red_flags: redFlags,
      summary,
      confidence: profile ? 0.75 : 0.2,
      input_language: detectedLanguage,
    },
    recommendation: matches[0] ?? null,
    alternatives: matches.slice(1),
    pre_alert_text: copy.demoPrealert,
    emergency_numbers: { ambulance: "108", unified: "112" },
    warnings: [caution, ...(offline ? [copy.requestError] : [])],
    ui_copy: {
      response_language: responseLanguage,
      emergency_banner: copy.emergencyBannerFallback,
      disclaimer: isSynthetic ? copy.demoDisclaimer : copy.liveDisclaimer,
      capabilities_note: isSynthetic
        ? copy.syntheticNotice
        : copy.publicDataNotice,
      actions_unavailable: copy.navigateUnavailable,
    },
    meta: {
      classifier: "keyword",
      provider: "none",
      latency_ms: 1,
      cached: false,
    },
  };
}

export async function requestTriage(
  text: string,
  location: Location,
  language: Language = "auto",
): Promise<{ data: TriageResponse; demo: boolean }> {
  const request = TriageRequestSchema.parse({
    text,
    lat: location.lat,
    lng: location.lng,
    location_source: location.source,
    language,
  });
  if (!process.env.NEXT_PUBLIC_TRIAGE_API_URL)
    return {
      data: makeDemoResponse(request.text, location, language),
      demo: true,
    };

  // If the backend is configured, do not swallow failures or fabricate demo results.
  return await requestBackendTriage(request.text, location, language);
}

export { requestVoiceTranscription } from "./voice-client";
export * from "./nearby-contracts";
export * from "./nearby-client";
