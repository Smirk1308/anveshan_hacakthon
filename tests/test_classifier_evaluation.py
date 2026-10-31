import unittest

from backend.classifier import _keyword_classification, detect_language
from backend.schemas import EmergencyType, Severity


class ClassifierEvaluationTests(unittest.TestCase):
    def classify(self, text: str):
        language = detect_language(text)
        return _keyword_classification(text, language, language)

    def test_severe_bleeding_remains_serious_and_keeps_red_flag(self):
        result = self.classify("deep cut, bleeding a lot")

        self.assertIsNotNone(result)
        self.assertEqual(result.type, EmergencyType.SEVERE_BLEEDING)
        self.assertEqual(result.severity, Severity.SERIOUS)
        self.assertIn("severe_bleeding", result.red_flags)

    def test_child_with_fits_is_pediatric_serious_and_keeps_seizure_flag(self):
        result = self.classify("my 2 year old has high fever and fits")

        self.assertIsNotNone(result)
        self.assertEqual(result.type, EmergencyType.PEDIATRIC_EMERGENCY)
        self.assertEqual(result.severity, Severity.SERIOUS)
        self.assertEqual(result.age_group, "child")
        self.assertIn("seizure", result.red_flags)

    def test_standalone_seizure_is_critical(self):
        result = self.classify("he is having a seizure")

        self.assertIsNotNone(result)
        self.assertEqual(result.type, EmergencyType.SEIZURE)
        self.assertEqual(result.severity, Severity.CRITICAL)
        self.assertIn("seizure", result.red_flags)

    def test_romanized_hindi_acid_ingestion(self):
        text = "mere dost ne tezab piya"
        result = self.classify(text)

        self.assertIsNotNone(result)
        self.assertEqual(result.type, EmergencyType.POISONING_INGESTION)
        self.assertEqual(result.severity, Severity.CRITICAL)
        self.assertEqual(result.input_language, "hi")

    def test_devanagari_hindi_acid_ingestion(self):
        text = "मेरे दोस्त ने तेज़ाब पी लिया"
        result = self.classify(text)

        self.assertIsNotNone(result)
        self.assertEqual(result.type, EmergencyType.POISONING_INGESTION)
        self.assertEqual(result.severity, Severity.CRITICAL)
        self.assertEqual(result.input_language, "hi")


if __name__ == "__main__":
    unittest.main()
