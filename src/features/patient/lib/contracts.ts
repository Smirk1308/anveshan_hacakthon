import { z } from "zod";

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  source: z.enum(["gps", "manual"]),
  label: z.string(),
});

const HospitalSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().default(""),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  verified: z.boolean(),
  last_verified: z.string().default(""),
  capabilities: z.array(z.string()).default([]),
});

const MatchSchema = z.object({
  hospital: HospitalSchema,
  distance_km: z.number().nonnegative(),
  eta_min_approx: z.number().nonnegative(),
  reasons: z.array(z.string()),
  matched_required: z.array(z.string()).default([]),
  matched_preferred: z.array(z.string()).default([]),
  missing_preferred: z.array(z.string()).default([]),
  directions_url: z.string().optional(),
  call_url: z.string().optional(),
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
  recommendation: MatchSchema.nullable(),
  alternatives: z.array(MatchSchema),
  pre_alert_text: z.string(),
  emergency_numbers: z.object({ ambulance: z.string(), unified: z.string() }),
  warnings: z.array(z.string()),
  meta: z.object({
    classifier: z.enum(["keyword", "llm", "fallback"]),
    provider: z.enum(["gemini", "groq", "ollama", "none"]),
    latency_ms: z.number().nonnegative(),
    cached: z.boolean(),
  }),
});

export type Location = z.infer<typeof LocationSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;
export type HospitalMatch = z.infer<typeof MatchSchema>;

export const TriageRequestSchema = z.object({
  text: z.string().trim().min(2).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  location_source: z.enum(["gps", "manual"]),
});
