import { z } from "zod";

export const LanguageSchema = z.enum(["auto", "en", "hi", "kn"]);
export type Language = z.infer<typeof LanguageSchema>;
export type ResponseLanguage = Exclude<Language, "auto">;

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  source: z.enum(["gps", "manual"]),
  label: z.string(),
});

export const VoiceTranscriptionResponseSchema = z.object({
  text: z.string().min(1).max(500),
  language: z.enum(["en", "hi", "kn"]),
  duration_seconds: z.number().nonnegative().max(20),
});
export type VoiceTranscriptionResponse = z.infer<
  typeof VoiceTranscriptionResponseSchema
>;

export const HospitalSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  type: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  departments: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
  source: z.string().nullable().optional(),
  source_urls: z.array(z.string()).default([]),
  source_kind: z.string().nullable().optional(),
  verified: z.boolean(),
  verified_by: z.string().nullable().optional(),
  last_verified: z.string().nullable().optional(),
  research_checked_on: z.string().nullable().optional(),
  location_verified: z.boolean().default(false),
  location_source_url: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export const HospitalMatchSchema = HospitalSchema.extend({
  distance_km: z.number().nonnegative(),
  eta_min_approx: z.number().nonnegative(),
  reasons: z.array(z.string()),
  matched_required: z.array(z.string()).default([]),
  matched_preferred: z.array(z.string()).default([]),
  missing_preferred: z.array(z.string()).default([]),
  directions_url: z.string().nullable().optional(),
  call_url: z.string().nullable().optional(),
});

const UiCopySchema = z.object({
  response_language: z.enum(["en", "hi", "kn"]),
  emergency_banner: z.string(),
  disclaimer: z.string(),
  capabilities_note: z.string(),
  actions_unavailable: z.string(),
});

export const TriageResponseSchema = z.object({
  emergency: z.object({
    type: z.string(),
    severity: z.enum(["critical", "serious", "moderate", "unclear"]),
    age_group: z.enum(["child", "teen", "adult", "elderly", "unknown"]),
    red_flags: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
    input_language: z.enum(["en", "hi", "kn", "mixed"]),
  }),
  recommendation: HospitalMatchSchema.nullable(),
  alternatives: z.array(HospitalMatchSchema),
  pre_alert_text: z.string(),
  emergency_numbers: z.object({ ambulance: z.string(), unified: z.string() }),
  warnings: z.array(z.string()),
  ui_copy: UiCopySchema,
  meta: z.object({
    classifier: z.enum(["keyword", "llm", "fallback"]),
    provider: z.enum(["gemini", "groq", "ollama", "none"]),
    latency_ms: z.number().nonnegative(),
    cached: z.boolean(),
  }),
});

export type Location = z.infer<typeof LocationSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;
export type HospitalRecord = z.infer<typeof HospitalSchema>;
export type HospitalMatch = z.infer<typeof HospitalMatchSchema>;

export const TriageRequestSchema = z.object({
  text: z.string().trim().min(2).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  location_source: z.enum(["gps", "manual"]),
  language: LanguageSchema.default("auto"),
});
