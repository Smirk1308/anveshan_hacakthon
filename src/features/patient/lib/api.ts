import samples from "../../../../data/demo-hospitals.json";
import {
  HospitalMatch,
  Language,
  Location,
  TriageRequestSchema,
  TriageResponse,
  TriageResponseSchema,
} from "./contracts";
import { getUiCopy } from "./ui-copy";

const sampleHospitals = samples as HospitalMatch["hospital"][];
const API_URL = process.env.NEXT_PUBLIC_TRIAGE_API_URL?.replace(/\/$/, "");

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

function haversineKm(origin: Location, hospital: HospitalMatch["hospital"]) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(hospital.lat - origin.lat);
  const dLng = radians(hospital.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.lat)) *
      Math.cos(radians(hospital.lat)) *
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
  const target =
    profileType === "poisoning_ingestion"
      ? "sample_a"
      : profileType === "snake_bite"
        ? "sample_b"
        : profileType === "burns"
          ? "sample_d"
          : profileType === "cardiac"
            ? "sample_e"
            : "sample_c";
  const ordered = [
    ...sampleHospitals.filter((hospital) => hospital.id === target),
    ...sampleHospitals.filter((hospital) => hospital.id !== target),
  ].slice(0, 3);
  const matches = ordered.map((hospital): HospitalMatch => {
    const distance = haversineKm(location, hospital);
    const preferred = profile?.preferred ?? ["icu"];
    const matched = preferred.filter((capability) =>
      hospital.capabilities.includes(capability),
    );
    return {
      hospital,
      distance_km: Number(distance.toFixed(1)),
      eta_min_approx: Math.max(1, Math.round((distance / 25) * 60)),
      reasons: [
        copy.capabilityLabels.emergency_24x7,
        ...matched.map(
          (capability) =>
            capabilityLabelMap[capability] ?? capability.replaceAll("_", " "),
        ),
      ].slice(0, 3),
      matched_required: ["emergency_24x7"],
      matched_preferred: matched,
      missing_preferred: preferred.filter(
        (capability) => !matched.includes(capability),
      ),
    };
  });
  const summary =
    copy.demoSummaries[profileType as keyof typeof copy.demoSummaries] ??
    copy.demoSummaries.general_unclear;
  const caution = copy.syntheticNotice;
  return {
    emergency: {
      type: profileType,
      severity: profile?.severity ?? "unclear",
      age_group: ageGroup,
      red_flags: redFlags,
      summary,
      confidence: profile ? 0.5 : 0,
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
      disclaimer: copy.demoDisclaimer,
      capabilities_note: copy.syntheticNotice,
      actions_unavailable: copy.navigateUnavailable,
    },
    meta: {
      classifier: "fallback",
      provider: "none",
      latency_ms: 0,
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
  if (!API_URL)
    return {
      data: makeDemoResponse(request.text, location, language),
      demo: true,
    };

  try {
    const response = await fetch(API_URL + "/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("The matching service is not available right now.");
    return {
      data: TriageResponseSchema.parse(await response.json()),
      demo: false,
    };
  } catch {
    return {
      data: makeDemoResponse(request.text, location, language, true),
      demo: true,
    };
  }
}
