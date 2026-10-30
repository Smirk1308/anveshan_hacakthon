import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.schemas import TriageRequest, VoiceTranscriptionResponse
from backend.voice import InvalidAudioError, transcribe_audio


class VoiceTranscriptionTests(unittest.TestCase):
    def test_transcription_preserves_kannada_text_and_detected_language(self):
        model = Mock()
        model.transcribe.return_value = (
            [SimpleNamespace(text=" ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ ")],
            SimpleNamespace(language="kn"),
        )
        with patch("backend.voice._get_model", return_value=model):
            result = transcribe_audio(b"audio", "kn", 3.2)

        self.assertEqual(result["text"], "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ")
        self.assertEqual(result["language"], "kn")
        self.assertEqual(result["duration_seconds"], 3.2)
        VoiceTranscriptionResponse(**result)
        model.transcribe.assert_called_once()

    def test_empty_transcript_is_rejected(self):
        model = Mock()
        model.transcribe.return_value = ([], SimpleNamespace(language="en"))
        with patch("backend.voice._get_model", return_value=model):
            with self.assertRaisesRegex(InvalidAudioError, "No speech"):
                transcribe_audio(b"audio", "auto", 1.0)

    def test_unsupported_detected_language_is_not_silently_changed(self):
        model = Mock()
        model.transcribe.return_value = (
            [SimpleNamespace(text="some words")],
            SimpleNamespace(language="ta"),
        )
        with patch("backend.voice._get_model", return_value=model):
            with self.assertRaisesRegex(InvalidAudioError, "English, Hindi, or Kannada"):
                transcribe_audio(b"audio", "auto", 1.0)

    def test_long_transcript_is_rejected_instead_of_truncated(self):
        model = Mock()
        model.transcribe.return_value = (
            [SimpleNamespace(text="x" * 501)],
            SimpleNamespace(language="en"),
        )
        with patch("backend.voice._get_model", return_value=model):
            with self.assertRaisesRegex(InvalidAudioError, "too long"):
                transcribe_audio(b"audio", "en", 5.0)

    def test_existing_triage_language_alias_still_normalizes(self):
        request = TriageRequest(
            text="emergency",
            lat=12.3,
            lng=76.6,
            location_source="manual",
            language="English",
        )

        self.assertEqual(request.language.value, "en")


if __name__ == "__main__":
    unittest.main()
