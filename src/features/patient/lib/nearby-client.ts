import {
  NearbyAvailabilityResponse,
  NearbyAvailabilityResponseSchema,
  NearbyCancelResponse,
  NearbyCancelResponseSchema,
  NearbyCategory,
  NearbyClaimResponse,
  NearbyClaimResponseSchema,
  NearbyConfig,
  NearbyConfigSchema,
  NearbyRegisterResponse,
  NearbyRegisterResponseSchema,
  NearbyRequestCreateResponse,
  NearbyRequestCreateResponseSchema,
  NearbyRequestStatusResponse,
  NearbyRequestStatusResponseSchema,
  PushSubscriptionPayload,
} from "./nearby-contracts";

export class NearbyApiError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "NearbyApiError";
    this.status = status;
  }
}

export type NearbyRequestOptions = {
  apiUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

function getApiUrl(options?: NearbyRequestOptions): string {
  const url = (
    options?.apiUrl ??
    process.env.NEXT_PUBLIC_TRIAGE_API_URL ??
    ""
  ).replace(/\/$/, "");
  if (!url) {
    throw new NearbyApiError(
      "The nearby community-help API is not configured.",
      503,
    );
  }
  return url;
}

async function requestJson<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
  token?: string,
  options?: NearbyRequestOptions,
): Promise<T> {
  const apiUrl = getApiUrl(options);
  const fetcher = options?.fetcher ?? fetch;
  const timeoutSignal = AbortSignal.timeout(10000);
  const combinedSignal =
    options?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetcher(`${apiUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof NearbyApiError) throw error;
    throw new NearbyApiError(
      "Could not connect to the nearby community-help service.",
      503,
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Request failed with status ${response.status}.`;
    throw new NearbyApiError(detail, response.status);
  }

  return payload as T;
}

export async function fetchNearbyConfig(
  options?: NearbyRequestOptions,
): Promise<NearbyConfig> {
  const data = await requestJson<unknown>(
    "/api/nearby/config",
    "GET",
    undefined,
    undefined,
    options,
  );
  return NearbyConfigSchema.parse(data);
}

export async function registerNearbyHelper(
  subscription: PushSubscriptionPayload | PushSubscription,
  options?: NearbyRequestOptions,
): Promise<NearbyRegisterResponse> {
  const body =
    typeof (subscription as PushSubscription).toJSON === "function"
      ? (subscription as PushSubscription).toJSON()
      : subscription;
  const data = await requestJson<unknown>(
    "/api/nearby/helpers/register",
    "POST",
    body,
    undefined,
    options,
  );
  return NearbyRegisterResponseSchema.parse(data);
}

export async function updateHelperAvailability(
  helperToken: string,
  position: { lat: number; lng: number },
  options?: NearbyRequestOptions,
): Promise<NearbyAvailabilityResponse> {
  const data = await requestJson<unknown>(
    "/api/nearby/helpers/availability",
    "POST",
    position,
    helperToken,
    options,
  );
  return NearbyAvailabilityResponseSchema.parse(data);
}

export async function stopHelperAvailability(
  helperToken: string,
  options?: NearbyRequestOptions,
): Promise<{ stopped?: boolean; status?: string }> {
  return await requestJson<{ stopped?: boolean; status?: string }>(
    "/api/nearby/helpers/stop",
    "POST",
    {},
    helperToken,
    options,
  );
}

export async function createHelpRequest(
  params: {
    lat: number;
    lng: number;
    category: NearbyCategory;
    consent: boolean;
  },
  options?: NearbyRequestOptions,
): Promise<NearbyRequestCreateResponse> {
  if (!params.consent) {
    throw new NearbyApiError(
      "Consent to share location and category is required.",
      400,
    );
  }
  const data = await requestJson<unknown>(
    "/api/nearby/requests",
    "POST",
    params,
    undefined,
    options,
  );
  return NearbyRequestCreateResponseSchema.parse(data);
}

export async function getHelpRequestStatus(
  requestId: string,
  token: string,
  options?: NearbyRequestOptions,
): Promise<NearbyRequestStatusResponse> {
  const data = await requestJson<unknown>(
    `/api/nearby/requests/${requestId}`,
    "GET",
    undefined,
    token,
    options,
  );
  return NearbyRequestStatusResponseSchema.parse(data);
}

export async function claimHelpRequest(
  requestId: string,
  helperToken: string,
  position: { lat: number; lng: number },
  options?: NearbyRequestOptions,
): Promise<NearbyClaimResponse> {
  const data = await requestJson<unknown>(
    `/api/nearby/requests/${requestId}/claim`,
    "POST",
    position,
    helperToken,
    options,
  );
  return NearbyClaimResponseSchema.parse(data);
}

export async function cancelHelpRequest(
  requestId: string,
  requesterToken: string,
  options?: NearbyRequestOptions,
): Promise<NearbyCancelResponse> {
  const data = await requestJson<unknown>(
    `/api/nearby/requests/${requestId}/cancel`,
    "POST",
    {},
    requesterToken,
    options,
  );
  return NearbyCancelResponseSchema.parse(data);
}
