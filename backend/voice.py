"""Optional local speech-to-text service backed by faster-whisper."""

from __future__ import annotations

import logging
import os
from io import BytesIO
from threading import Lock

logger = logging.getLogger("sahayai.voice")

MODEL_NAME = os.getenv("VOICE_MODEL", "small").strip() or "small"
VOICE_DEVICE = os.getenv("VOICE_DEVICE", "auto").strip().lower()
MAX_AUDIO_SECONDS = 20.0
_model = None
_model_lock = Lock()
_inference_lock = Lock()


class VoiceUnavailableError(RuntimeError):
    """Raised when the optional transcription runtime cannot be used."""


class InvalidAudioError(ValueError):
    """Raised when uploaded audio is invalid, too long, or has no speech."""


def _get_model():
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise VoiceUnavailableError("Speech recognition is not installed") from exc

        devices = ["cuda", "cpu"] if VOICE_DEVICE == "auto" else [VOICE_DEVICE]
        errors: list[Exception] = []
        for device in devices:
            compute_type = "int8_float16" if device == "cuda" else "int8"
            try:
                candidate = WhisperModel(MODEL_NAME, device=device, compute_type=compute_type)
                if device == "cuda":
                    import numpy as np
                    candidate.detect_language(np.zeros(16000, dtype=np.float32))
                _model = candidate
                logger.info("Local speech recognition ready: model=%s device=%s", MODEL_NAME, device)
                return _model
            except Exception as exc:
                errors.append(exc)
                logger.warning("Speech model initialization failed on %s (%s)", device, type(exc).__name__)

        raise VoiceUnavailableError("Speech recognition could not initialize") from errors[-1]


def inspect_audio(audio_bytes: bytes) -> float:
    """Read container metadata and reject invalid or overlong clips before inference."""
    try:
        import av
    except ImportError as exc:
        raise VoiceUnavailableError("Audio decoding is not installed") from exc

    try:
        with av.open(BytesIO(audio_bytes)) as container:
            audio_streams = [stream for stream in container.streams if stream.type == "audio"]
            duration = 0.0
            if audio_streams:
                stream = audio_streams[0]
                for frame in container.decode(stream):
                    if frame.sample_rate:
                        duration += frame.samples / frame.sample_rate
                        if duration > MAX_AUDIO_SECONDS:
                            raise InvalidAudioError("Recording is longer than 20 seconds")
    except InvalidAudioError:
        raise
    except Exception as exc:
        raise InvalidAudioError("Audio could not be decoded") from exc

    if not audio_streams or duration <= 0:
        raise InvalidAudioError("Audio duration could not be read")
    if duration > MAX_AUDIO_SECONDS:
        raise InvalidAudioError("Recording is longer than 20 seconds")
    return round(float(duration), 2)


def transcribe_audio(audio_bytes: bytes, language: str, duration_seconds: float) -> dict[str, str | float]:
    """Transcribe a short audio clip locally; never persist or log its contents."""
    model = _get_model()
    forced_language = None if language == "auto" else language
    try:
        # Serialize inference to keep concurrent uploads from exhausting GPU memory.
        with _inference_lock:
            segments, info = model.transcribe(
                BytesIO(audio_bytes),
                language=forced_language,
                beam_size=1,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            transcript = " ".join(segment.text.strip() for segment in segments).strip()
    except Exception as exc:
        logger.warning("Audio transcription failed (%s)", type(exc).__name__)
        raise VoiceUnavailableError("Speech recognition is temporarily unavailable") from exc

    if not transcript:
        raise InvalidAudioError("No speech was recognized")
    # Do not silently cut off clinically relevant words at the triage API limit.
    if len(transcript) > 500:
        raise InvalidAudioError("The recognized text is too long; record a shorter message")

    if info.language not in {"en", "hi", "kn"}:
        raise InvalidAudioError("Please choose English, Hindi, or Kannada and record again")
    detected_language = info.language
    return {"text": transcript, "language": detected_language, "duration_seconds": duration_seconds}
