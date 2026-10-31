import { TriageRequestSchema, TriageResponseSchema } from "./contracts";
import type { Language, Location, TriageResponse } from "./contracts";

type BackendRequest = {
  text: string;
  lat: number;
  lng: number;
  location_source: Location["source"];
  language: Language;
};

type RequestOptions = {
  apiUrl?: string;
  fetcher?: typeof fetch;
};

export async function requestBackendTriage(
  text: string,
  location: Location,
  language: Language = "auto",
  options: RequestOptions = {},
): Promise<{ data: TriageResponse; demo: false }> {
  const request: BackendRequest = TriageRequestSchema.parse({
    text,
    lat: location.lat,
    lng: location.lng,
    location_source: location.source,
    language,
  });
  const apiUrl = (
    options.apiUrl ??
    process.env.NEXT_PUBLIC_TRIAGE_API_URL ??
    ""
  ).replace(/\/$/, "");
  if (!apiUrl) throw new Error("The triage API URL is not configured.");

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${apiUrl}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("The matching service is not available right now.");
  }

  return {
    data: TriageResponseSchema.parse(await response.json()),
    demo: false,
  };
}
