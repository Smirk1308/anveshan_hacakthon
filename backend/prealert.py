from backend.i18n import copy_for, flag_label
from backend.schemas import Classification, HospitalResult


def build_prealert(text: str, emergency: Classification, recommendation: HospitalResult | None, language: str) -> str:
    copy = copy_for(language)
    age_phrases = {
        "child": {"en": "child", "hi": "बच्चा", "kn": "ಮಗು"},
        "teen": {"en": "teenager", "hi": "किशोर", "kn": "ಹದಿಹರೆಯದವರು"},
        "adult": {"en": "adult", "hi": "वयस्क", "kn": "ವಯಸ್ಕರು"},
        "elderly": {"en": "older adult", "hi": "बुज़ुर्ग", "kn": "ಹಿರಿಯರು"},
        "unknown": {"en": "not stated", "hi": "बताया नहीं गया", "kn": "ತಿಳಿಸಿಲ್ಲ"},
    }
    age = age_phrases.get(emergency.age_group, age_phrases["unknown"]).get(language, age_phrases["unknown"]["en"])
    distance_line = ""
    if recommendation:
        distance_line = (
            f"\n{copy['distance']}: {recommendation.distance_km:.1f} {copy['km']}, "
            f"{copy['arrival']} {recommendation.eta_min_approx} {copy['minutes']}"
        )
    flags = ", ".join(flag_label(flag, language) for flag in emergency.red_flags) if emergency.red_flags else copy["none_reported"]
    return (
        f"{copy['prealert_title']}\n"
        f"{copy['patient']}: {age}\n"
        f"{copy['situation']}: {text.strip()}\n"
        f"{copy['flags']}: {flags}{distance_line}\n"
        f"{copy['contact']}: {copy['contact_placeholder']}\n"
        f"{copy['please_be_ready']}"
    )
