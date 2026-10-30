import {
  Language,
  VoiceTranscriptionResponse,
  VoiceTranscriptionResponseSchema,
} from "./contracts";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_AUDIO_DURATION_SECONDS = 20;

export type VoiceRequestOptions = {
  apiUrl?: string;
  fetcher?: typeof fetch;
  mimeType?: string;
  signal?: AbortSignal;
};

export class VoiceTranscriptionError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "VoiceTranscriptionError";
    this.status = status;
  }
}

export async function requestVoiceTranscription(
  audioData: Blob | Uint8Array | ArrayBuffer,
  language: Language = "auto",
  options: VoiceRequestOptions = {},
): Promise<VoiceTranscriptionResponse> {
  const apiUrl = (
    options.apiUrl ??
    process.env.NEXT_PUBLIC_TRIAGE_API_URL ??
    ""
  ).replace(/\/$/, "");

  if (!apiUrl) {
    throw new VoiceTranscriptionError(
      "The voice transcription service is not configured. Please type your message instead.",
      503,
    );
  }

  const byteLength =
    audioData instanceof Blob
      ? audioData.size
      : audioData instanceof ArrayBuffer
        ? audioData.byteLength
        : audioData.length;

  if (byteLength > MAX_AUDIO_BYTES) {
    throw new VoiceTranscriptionError(
      "Recording is too large. Try a shorter clip.",
      413,
    );
  }

  if (byteLength === 0) {
    throw new VoiceTranscriptionError(
      "The recording was empty. Please record again or type your message.",
      400,
    );
  }

  let mimeType = options.mimeType;
  if (!mimeType && audioData instanceof Blob && audioData.type) {
    mimeType = audioData.type.split(";")[0].trim().toLowerCase();
  }
  if (!mimeType) {
    mimeType = "audio/webm";
  }

  const fetcher = options.fetcher ?? fetch;
  const url = `${apiUrl}/api/voice/transcribe?language=${encodeURIComponent(language)}`;

  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(15000);
    const combinedSignal =
      options.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
      },
      body: audioData as BodyInit,
      signal: combinedSignal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof VoiceTranscriptionError) throw error;
    throw new VoiceTranscriptionError(
      "Voice transcription service could not be reached. Please type your message instead.",
      503,
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = (await response.json()) as { detail?: string };
      if (typeof errJson.detail === "string") {
        detail = errJson.detail;
      }
    } catch {
      // Body may not be JSON
    }

    if (response.status === 413) {
      throw new VoiceTranscriptionError(
        detail || "Recording is too large. Try a shorter clip.",
        413,
      );
    }
    if (response.status === 415) {
      throw new VoiceTranscriptionError(
        detail || "Unsupported audio recording format.",
        415,
      );
    }
    if (response.status === 422) {
      throw new VoiceTranscriptionError(
        detail ||
          "Audio was unclear or unrecognized. Please record again or type your message.",
        422,
      );
    }
    if (response.status === 503) {
      throw new VoiceTranscriptionError(
        detail ||
          "Voice transcription is unavailable right now. Please type your message instead.",
        503,
      );
    }

    throw new VoiceTranscriptionError(
      detail || `Voice transcription failed with status ${response.status}.`,
      response.status,
    );
  }

  const payload = await response.json();
  return VoiceTranscriptionResponseSchema.parse(payload);
}
