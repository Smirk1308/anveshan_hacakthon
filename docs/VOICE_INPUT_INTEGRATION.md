# SahayAI Voice Input Integration

This document outlines the voice recording and transcription architecture connecting `codex/sahayai-frontend` with the FastAPI backend on `codex/backend`.

## Architecture overview

Voice input serves strictly as an audio-to-text input method. SahayAI does not provide spoken diagnosis, audio triage responses, or text-to-speech.

```
+------------------+         raw audio bytes (POST)         +--------------------+
|  Browser Client  | -------------------------------------> |   FastAPI Server   |
| (MediaRecorder)  | <------------------------------------- |  (faster-whisper)  |
+------------------+  { text, language, duration_seconds }  +--------------------+
        |
        v
[Review & Edit in textarea]
        |
        v
[Submit text to POST /api/triage]
```

## Endpoint contract

- **Route**: `POST /api/voice/transcribe?language=auto|en|hi|kn`
- **Request Body**: Raw binary audio bytes (do **not** use multipart/form-data).
- **Request Headers**:
  - `Content-Type`: The container MIME type, e.g. `audio/webm`, `audio/ogg`, `audio/wav`, or `audio/mp4`.
- **Query Parameter**:
  - `language`: `auto` (default), `en`, `hi`, or `kn`.
- **Constraints**:
  - Maximum recording duration: 20 seconds.
  - Maximum upload size: 10 MiB default (`VOICE_MAX_AUDIO_BYTES`).
- **Response Format**:
  ```json
  {
    "text": "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ",
    "language": "kn",
    "duration_seconds": 3.2
  }
  ```

## Frontend recording lifecycle

1. **Permission & Initialization**:
   - The user triggers recording via the microphone button.
   - The browser prompts for microphone permissions via `navigator.mediaDevices.getUserMedia({ audio: true })`.
   - If permission is denied or unsupported, a helpful localized notice is displayed and typed input remains active.
2. **Recording & Limits**:
   - Audio is recorded using `MediaRecorder` with the browser's preferred MIME type (e.g. `audio/webm;codecs=opus`, `audio/ogg`, `audio/mp4`).
   - A visual countdown displays up to 20 seconds. If the limit is reached, recording automatically stops.
   - The user may cancel recording at any time, discarding all buffered chunks and stopping microphone tracks.
3. **Transcription & Review**:
   - Upon stopping, recorded chunks are combined into a binary Blob and dispatched to `requestVoiceTranscription`.
   - The response populates the emergency description textarea.
   - If the user's interface language was set to `auto`, the triage language is updated to the detected language (`en`, `hi`, or `kn`), while explicitly selected languages are preserved.
   - The transcribed text is never auto-submitted: the user reviews, edits, and manually submits via the existing triage flow.
4. **Cleanup & Privacy**:
   - Audio tracks are stopped immediately upon completion or cancellation.
   - Raw audio is held strictly in memory during processing and is never stored in browser storage (`localStorage`, `sessionStorage`, or `IndexedDB`) or logged to console/files.

## Error handling and fallbacks

| Status Code | Cause                                  | Frontend Behavior                                      |
| ----------- | -------------------------------------- | ------------------------------------------------------ |
| **400**     | Empty recording                        | Prompts user to record again or type their message.    |
| **413**     | Audio > 10 MiB or > 20s                | Shows warning to record a shorter clip.                |
| **415**     | Unsupported audio MIME type            | Alerts user and defaults to typing.                    |
| **422**     | Unclear speech or unsupported language | Prompts user to speak clearly in EN/HI/KN or type.     |
| **503**     | Speech runtime not installed/available | Informs user voice is unavailable; fallback to typing. |

Typing in the situation input is never blocked by voice recording or transcription failures.

## Contract verification

Contract tests in `tests/triage-contract.test.cjs` verify:

- Raw audio transmission with accurate `Content-Type` headers.
- Query parameter forwarding (`language=auto|en|hi|kn`).
- Payload parsing matching `VoiceTranscriptionResponseSchema`.
- Accurate status code and error handling for 413, 415, 422, and 503 responses.
