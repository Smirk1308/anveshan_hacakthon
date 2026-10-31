from __future__ import annotations

import os
import re
import time
from collections import OrderedDict
from hashlib import sha256
from hmac import new as hmac_new
from secrets import token_bytes

from backend.llm import classify_with_llm
from backend.schemas import Classification, EmergencyType, Language, Severity


# Commonly used English, Devanagari/Roman Hindi, and Kannada/Roman Kannada phrases.
# Expand this lexicon with phrases the Mysuru team can review; it does not replace local-language review.
KEYWORDS: dict[EmergencyType, tuple[str, ...]] = {
    EmergencyType.POISONING_INGESTION: ("poison", "poisoning", "acid", "swallowed", "drank acid", "acid piya", "acid pee liya", "phenyl", "overdose", "vish", "visha", "zeher", "tezaab", "tezab", "ज़हर", "जहर", "तेज़ाब", "तेजाब", "तेज़ाब पी लिया", "तेजाब पी लिया", "एसिड", "अम्ल", "ವಿಷ", "ಆಸಿಡ್", "ಕುಡಿದ", "ನುಂಗಿದ"),
    EmergencyType.BURNS: ("burn", "burned", "burnt", "hot oil", "fire", "जल गया", "जल गई", "जलना", "jal gaya", "jal gayi", "suttu", "ಸುಟ್ಟ", "ಸುಟ್ಟಿದೆ", "ಬಿಸಿ ಎಣ್ಣೆ"),
    EmergencyType.SNAKE_BITE: ("snake bite", "snake bit", "snakebite", "bitten by a snake", "bitten by snake", "snake", "viper", "cobra", "सांप ने काटा", "साँप", "saap", "saap ne kata", "saanp ne kaata", "havu", "havu kachide", "ಹಾವು ಕಚ್ಚಿತು", "ಹಾವು ಕಚ್ಚಿದೆ", "ಸರ್ಪದ ಕಡಿತ"),
    EmergencyType.CARDIAC: ("chest pain", "heart attack", "heart pain", "chest tight", "seene mein dard", "seene me dard", "dil ka daura", "छाती में दर्द", "सीने में दर्द", "दिल का दौरा", "ಎದೆ ನೋವು", "ಹೃದಯಾಘಾತ", "ಎದೆ ಬಿಗಿತ"),
    EmergencyType.STROKE: ("face drooping", "slurred speech", "stroke", "face is drooping", "chehra tedha", "bolne mein dikkat", "चेहरा टेढ़ा", "बोलने में दिक्कत", "lakwa", "ಮುಖ ಓರೆಯಾಗಿದೆ", "ಮಾತು ತೊದಲುತ್ತಿದೆ", "ಸ್ಟ್ರೋಕ್"),
    EmergencyType.TRAUMA_ACCIDENT: ("accident", "crash", "bike accident", "road accident", "hit by car", "fell from", "गाड़ी दुर्घटना", "सड़क हादसा", "एक्सीडेंट", "अपघात", "ಅಪಘಾತ", "ಬೈಕ್ ಅಪಘಾತ", "ಕೆಳಗೆ ಬಿದ್ದ"),
    EmergencyType.SEVERE_BLEEDING: ("severe bleeding", "bleeding a lot", "heavy bleeding", "won't stop bleeding", "deep cut", "bahut khoon", "khoon beh raha", "zyada khoon", "खून बहुत", "बहुत खून", "खून बह रहा", "ज्यादा खून", "ತೀವ್ರ ರಕ್ತಸ್ರಾವ", "ತುಂಬಾ ರಕ್ತ", "ರಕ್ತ ನಿಲ್ಲುತ್ತಿಲ್ಲ"),
    EmergencyType.OBSTETRIC: ("in labour", "in labor", "water broke", "pregnant", "delivery", "प्रसव", "लेबर", "पानी टूट", "गर्भवती", "ಹೆರಿಗೆ", "ನೀರು ಒಡೆದಿದೆ", "ಗರ್ಭಿಣಿ"),
    EmergencyType.PEDIATRIC_EMERGENCY: ("child emergency", "baby emergency", "toddler", "2 year old", "2-year-old", "बच्चे को", "बच्चा", "शिशु", "ಮಗು", "ಮಕ್ಕಳ ತುರ್ತು", "ಎರಡು ವರ್ಷದ ಮಗು"),
    EmergencyType.BREATHING_DIFFICULTY: ("cannot breathe", "can't breathe", "difficulty breathing", "shortness of breath", "asthma attack", "saans nahi", "saans lene mein dikkat", "सांस नहीं", "साँस नहीं", "सांस लेने में", "दम घुट", "साँस फूल", "usiraadalu aaguttilla", "ಉಸಿರಾಡಲು ಆಗುತ್ತಿಲ್ಲ", "ಉಸಿರಾಟ ಕಷ್ಟ", "ಉಸಿರಾಟ ತೊಂದರೆ", "ಉಸಿರಾಟದ ತೊಂದರೆ"),
    EmergencyType.SEIZURE: ("seizure", "having a seizure", "fits", "convulsion", "daura", "fit aa rahe", "mirgi ka daura", "दौरा", "मिर्गी का दौरा", "ಸೆಳವು", "apasmara", "ಅಪಸ್ಮಾರ", "ಕಂಪನ ಬರುತ್ತಿದೆ"),
    EmergencyType.ALLERGIC_REACTION: ("allergic reaction", "allergy", "lips swelling", "face swelling", "hives", "एलर्जी", "सूजन", "होंठ सूज", "ಅಲರ್ಜಿ", "ತುಟಿ ಊತ", "ಮುಖ ಊತ"),
    EmergencyType.ELECTRIC_SHOCK_DROWNING: ("electric shock", "electrocuted", "drowning", "drowned", "बिजली का झटका", "करंट लगा", "डूब रहा", "विद्युत ಆಘಾತ", "ವಿದ್ಯುತ್ ಶಾಕ್", "ಮುಳುಗಿದ"),
    EmergencyType.MINOR_INJURY_FRACTURE: ("broken wrist", "looks broken", "fracture", "sprained", "minor injury", "wrist looks", "हड्डी टूट", "फ्रैक्चर", "ಮೂಳೆ ಮುರಿದ", "ಕೈ ಮುರಿದ", "ಮಣಿಕಟ್ಟು ಮುರಿದ"),
}

RED_FLAGS: dict[str, tuple[str, ...]] = {
    "unconscious": ("unconscious", "not conscious", "unresponsive", "passed out", "बेहोश", "होश नहीं", "hosh nahi", "behosh", "ಪ್ರಜ್ಞೆ ಇಲ್ಲ", "ಪ್ರಜ್ಞಾಹೀನ"),
    "not_breathing": ("not breathing", "stopped breathing", "cannot breathe", "can't breathe", "सांस नहीं", "साँस नहीं", "saans nahi", "saans nahi aa rahi", "ಉಸಿರಾಡುತ್ತಿಲ್ಲ", "ಉಸಿರಾಟ ಇಲ್ಲ", "usiraaduttilla"),
    "severe_bleeding": ("severe bleeding", "heavy bleeding", "bleeding a lot", "खून बहुत", "बहुत खून", "bahut khoon", "khoon beh raha", "zyada khoon", "ತೀವ್ರ ರಕ್ತಸ್ರಾವ", "ತುಂಬಾ ರಕ್ತ"),
    "seizure": ("seizure", "fits", "convulsion", "दौरा", "daura", "fit aa rahe", "mirgi ka daura", "ಸೆಳವು", "ಅಪಸ್ಮಾರ"),
    "chest_pain": ("chest pain", "chest tight", "heart attack", "सीने में दर्द", "छाती में दर्द", "seene mein dard", "seene me dard", "ಎದೆ ನೋವು", "ಎದೆ ಬಿಗಿತ"),
}

LABELS = {
    "en": {
        EmergencyType.POISONING_INGESTION: "Possible poisoning or ingestion",
        EmergencyType.BURNS: "Burn injury reported",
        EmergencyType.SNAKE_BITE: "Possible snake bite",
        EmergencyType.CARDIAC: "Possible cardiac emergency",
        EmergencyType.STROKE: "Possible stroke symptoms reported",
        EmergencyType.TRAUMA_ACCIDENT: "Accident or trauma reported",
        EmergencyType.SEVERE_BLEEDING: "Severe bleeding reported",
        EmergencyType.OBSTETRIC: "Urgent pregnancy or labour care requested",
        EmergencyType.PEDIATRIC_EMERGENCY: "Child emergency reported",
        EmergencyType.BREATHING_DIFFICULTY: "Breathing difficulty reported",
        EmergencyType.SEIZURE: "Seizure reported",
        EmergencyType.ALLERGIC_REACTION: "Possible allergic reaction",
        EmergencyType.ELECTRIC_SHOCK_DROWNING: "Electric shock or drowning emergency reported",
        EmergencyType.MINOR_INJURY_FRACTURE: "Possible fracture or injury",
        EmergencyType.GENERAL_UNCLEAR: "Emergency type unclear",
    },
    "hi": {
        EmergencyType.POISONING_INGESTION: "संभावित विष सेवन",
        EmergencyType.BURNS: "जलने की चोट बताई गई",
        EmergencyType.SNAKE_BITE: "संभावित साँप का काटना",
        EmergencyType.CARDIAC: "संभावित हृदय संबंधी आपात स्थिति",
        EmergencyType.STROKE: "स्ट्रोक जैसे लक्षण बताए गए",
        EmergencyType.TRAUMA_ACCIDENT: "दुर्घटना या चोट बताई गई",
        EmergencyType.SEVERE_BLEEDING: "अधिक रक्तस्राव बताया गया",
        EmergencyType.OBSTETRIC: "गर्भावस्था या प्रसव संबंधी तत्काल देखभाल",
        EmergencyType.PEDIATRIC_EMERGENCY: "बच्चे की आपात स्थिति बताई गई",
        EmergencyType.BREATHING_DIFFICULTY: "साँस लेने में कठिनाई बताई गई",
        EmergencyType.SEIZURE: "दौरे की सूचना दी गई",
        EmergencyType.ALLERGIC_REACTION: "संभावित एलर्जी प्रतिक्रिया",
        EmergencyType.ELECTRIC_SHOCK_DROWNING: "बिजली के झटके या डूबने की आपात स्थिति",
        EmergencyType.MINOR_INJURY_FRACTURE: "संभावित फ्रैक्चर या चोट",
        EmergencyType.GENERAL_UNCLEAR: "आपात स्थिति स्पष्ट नहीं है",
    },
    "kn": {
        EmergencyType.POISONING_INGESTION: "ವಿಷ ಸೇವನೆಯ ಸಾಧ್ಯತೆ",
        EmergencyType.BURNS: "ಸುಟ್ಟ ಗಾಯ ವರದಿಯಾಗಿದೆ",
        EmergencyType.SNAKE_BITE: "ಹಾವು ಕಚ್ಚಿರುವ ಸಾಧ್ಯತೆ",
        EmergencyType.CARDIAC: "ಹೃದಯ ಸಂಬಂಧಿತ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯ ಸಾಧ್ಯತೆ",
        EmergencyType.STROKE: "ಸ್ಟ್ರೋಕ್ ಲಕ್ಷಣಗಳು ವರದಿಯಾಗಿವೆ",
        EmergencyType.TRAUMA_ACCIDENT: "ಅಪಘಾತ ಅಥವಾ ಗಾಯ ವರದಿಯಾಗಿದೆ",
        EmergencyType.SEVERE_BLEEDING: "ತೀವ್ರ ರಕ್ತಸ್ರಾವ ವರದಿಯಾಗಿದೆ",
        EmergencyType.OBSTETRIC: "ಗರ್ಭಧಾರಣೆ ಅಥವಾ ಹೆರಿಗೆಗೆ ತುರ್ತು ಆರೈಕೆ",
        EmergencyType.PEDIATRIC_EMERGENCY: "ಮಗುವಿನ ತುರ್ತು ಪರಿಸ್ಥಿತಿ ವರದಿಯಾಗಿದೆ",
        EmergencyType.BREATHING_DIFFICULTY: "ಉಸಿರಾಟದ ತೊಂದರೆ ವರದಿಯಾಗಿದೆ",
        EmergencyType.SEIZURE: "ಸೆಳವು ವರದಿಯಾಗಿದೆ",
        EmergencyType.ALLERGIC_REACTION: "ಅಲರ್ಜಿ ಪ್ರತಿಕ್ರಿಯೆಯ ಸಾಧ್ಯತೆ",
        EmergencyType.ELECTRIC_SHOCK_DROWNING: "ವಿದ್ಯುತ್ ಶಾಕ್ ಅಥವಾ ಮುಳುಗುವ ತುರ್ತು ಪರಿಸ್ಥಿತಿ",
        EmergencyType.MINOR_INJURY_FRACTURE: "ಮೂಳೆ ಮುರಿತ ಅಥವಾ ಗಾಯದ ಸಾಧ್ಯತೆ",
        EmergencyType.GENERAL_UNCLEAR: "ತುರ್ತು ಪರಿಸ್ಥಿತಿ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ",
    },
}

SEVERITY = {
    EmergencyType.POISONING_INGESTION: Severity.CRITICAL,
    EmergencyType.BURNS: Severity.SERIOUS,
    EmergencyType.SNAKE_BITE: Severity.CRITICAL,
    EmergencyType.CARDIAC: Severity.CRITICAL,
    EmergencyType.STROKE: Severity.CRITICAL,
    EmergencyType.TRAUMA_ACCIDENT: Severity.CRITICAL,
    EmergencyType.SEVERE_BLEEDING: Severity.SERIOUS,
    EmergencyType.OBSTETRIC: Severity.SERIOUS,
    EmergencyType.PEDIATRIC_EMERGENCY: Severity.SERIOUS,
    EmergencyType.BREATHING_DIFFICULTY: Severity.CRITICAL,
    EmergencyType.SEIZURE: Severity.CRITICAL,
    EmergencyType.ALLERGIC_REACTION: Severity.SERIOUS,
    EmergencyType.ELECTRIC_SHOCK_DROWNING: Severity.SERIOUS,
    EmergencyType.MINOR_INJURY_FRACTURE: Severity.MODERATE,
    EmergencyType.GENERAL_UNCLEAR: Severity.UNCLEAR,
}

_cache: OrderedDict[tuple[str, str], tuple[float, Classification, str, str]] = OrderedDict()
_CACHE_LIMIT = 256
_CACHE_TTL_SECONDS = 30 * 60
_CACHE_HMAC_KEY = token_bytes(32)


def _cache_key(text: str, requested_language: Language) -> tuple[str, str]:
    # Keep raw emergency descriptions out of the in-memory classification cache.
    digest = hmac_new(_CACHE_HMAC_KEY, _normalize(text).encode("utf-8"), sha256).hexdigest()
    return digest, requested_language.value
DEMO_PHRASES = (
    "my friend drank acid, he is 19",
    "child swallowed phenyl",
    "hot oil spilled on my mother's arm",
    "snake bit my father in the field",
    "chest pain and sweating, age 55",
    "face drooping and slurred speech",
    "bike accident, bleeding from head",
    "deep cut, bleeding a lot",
    "wife in labour, water broke",
    "my 2 year old has high fever and fits",
    "cannot breathe, asthma attack",
    "he is having a seizure",
    "ನನ್ನ ತಂದೆಗೆ ಹಾವು ಕಚ್ಚಿದೆ",
    "मेरे पिता को सीने में दर्द है",
    "ಉಸಿರಾಟದ ತೊಂದರೆ ಇದೆ",
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().casefold())


def detect_language(text: str) -> str:
    devanagari = len(re.findall(r"[\u0900-\u097F]", text))
    kannada = len(re.findall(r"[\u0C80-\u0CFF]", text))
    if devanagari and kannada:
        return "mixed"
    if devanagari:
        return "hi"
    if kannada:
        return "kn"
    lowered = text.casefold()
    hindi_roman = sum(word in lowered for word in ("hai", "ko", "mein", "mere", "saap", "zeher", "tezaab", "tezab", "dard", "behosh", "jal gaya", "saans"))
    kannada_roman = sum(word in lowered for word in ("ide", "illa", "nanna", "avanu", "avalu", "suttu", "havu", "novu", "kacchide"))
    if hindi_roman and kannada_roman:
        return "mixed"
    if hindi_roman:
        return "hi"
    if kannada_roman:
        return "kn"
    return "en"


def _age_group(text: str) -> str:
    match = re.search(r"\b(\d{1,3})[- ]*(?:year|yr|years|yrs)[- ]*old\b", text, re.IGNORECASE)
    if not match:
        match = re.search(r"\b(\d{1,3})\s*(?:year|yr|years|yrs|వರ್ಷ|ವರ್ಷ|साल|वर्ष)", text, re.IGNORECASE)
    if not match:
        match = re.search(r"\b(?:age|aged)\s*(\d{1,3})\b", text, re.IGNORECASE)
    if not match:
        match = re.search(r"\b(?:he|she|they|patient|age)\s+(?:is\s+)?(\d{1,3})\b", text, re.IGNORECASE)
    if not match:
        if any(word in text for word in ("child", "baby", "toddler", "बच्चा", "बच्चे", "शिशु", "ಮಗು", "ಮಕ್ಕಳ")):
            return "child"
        return "unknown"
    age = int(match.group(1))
    if age < 13:
        return "child"
    if age < 18:
        return "teen"
    if age < 65:
        return "adult"
    return "elderly"


def _keyword_classification(text: str, input_language: str, response_language: str) -> Classification | None:
    normalized = _normalize(text)
    matched: list[tuple[EmergencyType, int]] = []
    for emergency_type, phrases in KEYWORDS.items():
        hits = sum(1 for phrase in phrases if _normalize(phrase) in normalized)
        if hits:
            matched.append((emergency_type, hits))
    if not matched:
        return None
    matched.sort(key=lambda item: item[1], reverse=True)
    age_group = _age_group(normalized)
    pediatric_context = age_group == "child" or any(word in normalized for word in ("child", "baby", "toddler", "बच्चा", "बच्चे", "शिशु", "ಮಗು", "ಮಕ್ಕಳ"))
    if pediatric_context and EmergencyType.SEIZURE in {kind for kind, _ in matched}:
        matched = [(EmergencyType.PEDIATRIC_EMERGENCY, 2)] + [(kind, hits) for kind, hits in matched if kind != EmergencyType.PEDIATRIC_EMERGENCY]
    # When multiple distinct categories are equally plausible, allow the configured model to disambiguate.
    if len(matched) > 1 and matched[0][1] == matched[1][1]:
        return None
    emergency_type = matched[0][0]
    flags = [flag for flag, phrases in RED_FLAGS.items() if any(_normalize(p) in normalized for p in phrases)]
    # Red flags drive the urgent UI banner independently of the category severity.
    # This preserves the brief's expected seriousness for severe bleeding and
    # pediatric emergencies while a standalone seizure remains critical.
    severity = SEVERITY[emergency_type]
    language = response_language if response_language in LABELS else "en"
    return Classification(
        type=emergency_type,
        severity=severity,
        age_group=age_group,
        red_flags=flags,
        summary=LABELS[language].get(emergency_type, LABELS["en"][emergency_type]),
        confidence=min(0.96, 0.76 + 0.1 * (matched[0][1] - 1)),
        input_language=input_language if input_language in {"en", "hi", "kn", "mixed"} else "en",
    )


def prewarm_keyword_cache() -> None:
    """Prime deterministic demo phrases without making network calls during startup."""
    now = time.monotonic()
    for phrase in DEMO_PHRASES:
        detected = detect_language(phrase)
        for requested_language in Language:
            response_language = requested_language.value if requested_language != Language.AUTO else detected
            result = _keyword_classification(phrase, detected, response_language)
            if result is not None:
                _cache[_cache_key(phrase, requested_language)] = (now, result, "keyword", "none")


async def classify(text: str, requested_language: Language) -> tuple[Classification, str, bool, str, str]:
    detected = detect_language(text)
    response_language = requested_language.value if requested_language != Language.AUTO else detected
    cache_key = _cache_key(text, requested_language)
    now = time.monotonic()
    cached = _cache.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        _cache.move_to_end(cache_key)
        return cached[1].model_copy(deep=True), cached[2], True, detected, cached[3]
    if cached:
        _cache.pop(cache_key, None)

    result = _keyword_classification(text, detected, response_language)
    provider = "none"
    classifier = "keyword"
    if result is None:
        classifier = "fallback"
        result = Classification(
            type=EmergencyType.GENERAL_UNCLEAR,
            severity=Severity.UNCLEAR,
            age_group=_age_group(text),
            red_flags=[flag for flag, phrases in RED_FLAGS.items() if any(_normalize(p) in _normalize(text) for p in phrases)],
            summary=LABELS.get(response_language, LABELS["en"])[EmergencyType.GENERAL_UNCLEAR],
            confidence=0.0,
            input_language=detected if detected in {"en", "hi", "kn", "mixed"} else "en",
        )
        allow_text_sharing = os.getenv("LLM_ALLOW_USER_TEXT_SHARING", "false").strip().lower() == "true"
        if allow_text_sharing:
            try:
                result, provider = await classify_with_llm(text, requested_language, detected)
                result.input_language = detected if detected in {"en", "hi", "kn", "mixed"} else "en"
                if result.type == EmergencyType.GENERAL_UNCLEAR:
                    result.summary = LABELS.get(response_language, LABELS["en"])[EmergencyType.GENERAL_UNCLEAR]
                classifier = "llm"
                keyword_flags = [flag for flag, phrases in RED_FLAGS.items() if any(_normalize(p) in _normalize(text) for p in phrases)]
                result.red_flags = list(dict.fromkeys(result.red_flags + keyword_flags))
            except Exception as exc:
                # Do not log raw user text or provider response.
                import logging
                logging.getLogger(__name__).warning("Classifier used rules fallback (%s)", type(exc).__name__)
                from backend.llm import configured_provider
                provider = configured_provider()

    if result.type == EmergencyType.GENERAL_UNCLEAR and classifier != "llm":
        classifier = "fallback"
    if len(_cache) >= _CACHE_LIMIT:
        _cache.popitem(last=False)
    _cache[cache_key] = (now, result.model_copy(deep=True), classifier, provider)
    return result, classifier, False, detected, provider
