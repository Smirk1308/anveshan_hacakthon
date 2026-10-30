import { z } from "zod";

export const NearbyCategorySchema = z.enum([
  "poisoning_ingestion",
  "burns",
  "snake_bite",
  "cardiac",
  "stroke",
  "trauma_accident",
  "severe_bleeding",
  "obstetric",
  "pediatric_emergency",
  "breathing_difficulty",
  "seizure",
  "allergic_reaction",
  "electric_shock_drowning",
  "minor_injury_fracture",
  "general_unclear",
]);
export type NearbyCategory = z.infer<typeof NearbyCategorySchema>;

export const NearbyConfigSchema = z.object({
  enabled: z.boolean(),
  public_key: z.string().nullable().optional(),
  vapid_public_key: z.string().nullable().optional(),
  radius_m: z.number().default(500),
  request_ttl_seconds: z.number().default(600),
  helper_ttl_seconds: z.number().default(900),
  location_fresh_seconds: z.number().default(180),
});
export type NearbyConfig = z.infer<typeof NearbyConfigSchema>;

export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string(),
  auth: z.string(),
});

export const PushSubscriptionPayloadSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: PushSubscriptionKeysSchema,
});
export type PushSubscriptionPayload = z.infer<
  typeof PushSubscriptionPayloadSchema
>;

export const NearbyRegisterResponseSchema = z.object({
  helper_token: z.string().min(1),
});
export type NearbyRegisterResponse = z.infer<
  typeof NearbyRegisterResponseSchema
>;

export const NearbyAvailabilityResponseSchema = z.object({
  available_until: z.number(),
  radius_m: z.number().default(500),
});
export type NearbyAvailabilityResponse = z.infer<
  typeof NearbyAvailabilityResponseSchema
>;

export const NearbyRequestCreateResponseSchema = z.object({
  request_id: z.string(),
  requester_token: z.string(),
  status: z.enum(["open", "claimed", "expired", "cancelled"]),
  alerts_queued: z.number().nonnegative(),
  radius_m: z.number().default(500),
  expires_at: z.number(),
  message: z.string().optional(),
});
export type NearbyRequestCreateResponse = z.infer<
  typeof NearbyRequestCreateResponseSchema
>;

export const NearbyRequestStatusResponseSchema = z.object({
  request_id: z.string(),
  status: z.enum(["open", "claimed", "expired", "cancelled", "unavailable"]),
  category: z.string(),
  expires_at: z.number(),
  helper_accepted: z.boolean().optional(),
});
export type NearbyRequestStatusResponse = z.infer<
  typeof NearbyRequestStatusResponseSchema
>;

export const NearbyClaimResponseSchema = z.object({
  request_id: z.string(),
  status: z.literal("claimed"),
  category: z.string(),
  requester_location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  directions_url: z.string(),
});
export type NearbyClaimResponse = z.infer<typeof NearbyClaimResponseSchema>;

export const NearbyCancelResponseSchema = z.object({
  request_id: z.string(),
  status: z.literal("cancelled"),
});
export type NearbyCancelResponse = z.infer<typeof NearbyCancelResponseSchema>;
