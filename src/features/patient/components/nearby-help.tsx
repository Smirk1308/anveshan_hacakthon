"use client";

import { useCallback, useEffect, useState } from "react";
import type { Language, Location } from "../lib/contracts";
import {
  claimHelpRequest,
  cancelHelpRequest,
  createHelpRequest,
  fetchNearbyConfig,
  getHelpRequestStatus,
  registerNearbyHelper,
  stopHelperAvailability,
  updateHelperAvailability,
  NearbyConfig,
  NearbyCategory,
  NearbyRequestCreateResponse,
} from "../lib/api";

const HELPER_KEY = "sahayai.nearby.helper-token";
const REQUEST_KEY = "sahayai.nearby.request";

const COPY = {
  en: {
    title: "Nearby community help",
    intro:
      "Opt-in volunteer alerts can reach helpers within 500 m. This does not replace 108 or 112.",
    disclaimer:
      "Community help is a peer volunteer feature and NOT emergency dispatch. Always call 108 or 112 first.",
    helperTitle: "Volunteer as a nearby helper",
    helperDesc:
      "Receive generic alerts when someone within 500 m requests assistance.",
    enable: "Turn on helper alerts",
    stop: "Stop sharing availability",
    ready:
      "You are available to help for up to 15 minutes. Keep this tab open to keep your location fresh.",
    requestTitle: "Request help from nearby people",
    requestDesc:
      "Notify opted-in volunteers within 500 m. Exact location is shared only after a volunteer accepts.",
    consent:
      "I agree to share my live GPS location and emergency category with nearby helpers within 500 m for up to 10 minutes. My situation description is not shared.",
    send: "Send nearby alert",
    sending: "Sending alert…",
    sentWithCount:
      "{count} nearby alert delivery attempt(s) queued. Keep 108 or 112 available; push delivery is best-effort and not guaranteed.",
    noHelpers:
      "No active helpers are currently within 500 m. Call 108 or 112 immediately if help is urgent.",
    waitingStatus: "Waiting for a nearby helper to accept…",
    accepted:
      "A nearby helper accepted your request. Emergency services (108/112) remain your primary response.",
    expired:
      "This request has expired (10-minute limit). Call 108 or 112 for urgent help.",
    cancelled: "This help request was cancelled.",
    cancel: "Cancel request",
    cancelling: "Cancelling…",
    permissionDenied:
      "Notification or location permission was denied. Please allow permissions in your browser settings.",
    locationGpsRequired:
      "Live GPS location is required to request nearby help. Approximate or manual locations cannot be used.",
    configure:
      "Nearby alerts require HTTPS and VAPID push keys configured on the backend.",
    iosHint:
      "On iPhone/iPad, add SahayAI to your Home Screen from Safari to enable Web Push.",
    failure:
      "Could not connect to nearby help. Please call 108 or 112 for urgent assistance.",
    accepting: "Accept this request",
    acceptBusy: "Accepting…",
    incomingTitle: "Incoming nearby help request",
    incomingDesc:
      "A person within 500 m requested help for an emergency ({category}). Your exact location will be shared only after you accept.",
    claimedSuccess:
      "Request accepted. Exact requester location unlocked. Follow the walking route below:",
    openMap: "Open walking route in Google Maps",
    dismiss: "Dismiss alert",
    alreadyClaimedOrClosed:
      "This request has already been accepted by another helper or has closed.",
    outsideArea:
      "You are outside the 500 m request area and cannot accept this request.",
    staleLocation: "Please refresh your location and try again.",
    statusLabel: "Request status",
    categoryLabel: "Emergency category",
  },
  hi: {
    title: "आस-पास सामुदायिक सहायता",
    intro:
      "सहमति देने वाले मददगारों को 500 मीटर के भीतर सूचना जा सकती है। यह 108 या 112 का विकल्प नहीं है।",
    disclaimer:
      "सामुदायिक सहायता एक स्वैच्छिक सुविधा है, आपातकालीन सेवा नहीं। आपात स्थिति में हमेशा पहले 108 या 112 पर कॉल करें।",
    helperTitle: "आसपास मददगार के रूप में जुड़ें",
    helperDesc:
      "500 मीटर के भीतर किसी को मदद की आवश्यकता होने पर सामान्य सूचना प्राप्त करें।",
    enable: "मददगार सूचनाएँ चालू करें",
    stop: "उपलब्धता साझा करना बंद करें",
    ready:
      "आप 15 मिनट तक मदद के लिए उपलब्ध हैं। स्थान अपडेट रखने के लिए यह पेज खुला रखें।",
    requestTitle: "आसपास के लोगों से मदद माँगें",
    requestDesc:
      "500 मीटर के दायरे में स्वयंसेवकों को सूचित करें। सटीक स्थान केवल स्वीकार करने के बाद साझा होगा।",
    consent:
      "मैं 500 मीटर के भीतर के मददगारों के साथ 10 मिनट तक अपना लाइव GPS स्थान और आपात श्रेणी साझा करने की सहमति देता/देती हूँ। मेरा पूरा विवरण साझा नहीं होगा।",
    send: "आसपास सूचना भेजें",
    sending: "सूचना भेजी जा रही है…",
    sentWithCount:
      "{count} आसपास के मददगारों को सूचना भेजने का प्रयास किया गया। 108 या 112 उपलब्ध रखें; सूचना पहुँचने की गारंटी नहीं है।",
    noHelpers:
      "अभी 500 मीटर के दायरे में कोई सक्रिय मददगार नहीं हैं। तुरंत 108 या 112 पर कॉल करें।",
    waitingStatus: "मददगार द्वारा स्वीकार किए जाने की प्रतीक्षा है…",
    accepted:
      "एक मददगार ने अनुरोध स्वीकार कर लिया है। आपातकालीन सेवाएँ (108/112) आपकी मुख्य सहायता हैं।",
    expired:
      "इस अनुरोध का समय समाप्त हो गया है (10 मिनट सीमा)। तुरंत 108 या 112 पर कॉल करें।",
    cancelled: "यह मदद अनुरोध रद्द कर दिया गया।",
    cancel: "अनुरोध रद्द करें",
    cancelling: "रद्द किया जा रहा है…",
    permissionDenied:
      "सूचना या स्थान की अनुमति अस्वीकृत कर दी गई। कृपया ब्राउज़र सेटिंग्स में अनुमति दें।",
    locationGpsRequired:
      "आसपास मदद माँगने के लिए लाइव GPS स्थान आवश्यक है। अनुमानित या मैन्युअल स्थान उपयोग नहीं हो सकता।",
    configure: "टीम को HTTPS और VAPID push keys सेट करनी होंगी।",
    iosHint:
      "iPhone/iPad पर वेब पुश चालू करने के लिए Safari से होम स्क्रीन पर जोड़ें।",
    failure:
      "आसपास सहायता से जुड़ नहीं सका। तुरंत मदद के लिए 108 या 112 पर कॉल करें।",
    accepting: "यह अनुरोध स्वीकार करें",
    acceptBusy: "स्वीकार किया जा रहा है…",
    incomingTitle: "आसपास से मदद का अनुरोध आया है",
    incomingDesc:
      "500 मीटर के भीतर किसी ने आपात स्थिति ({category}) के लिए मदद माँगी है। स्वीकार करने के बाद ही सटीक स्थान साझा होगा।",
    claimedSuccess: "अनुरोध स्वीकार हुआ। नीचे दिए गए लिंक से पैदल मार्ग देखें:",
    openMap: "Google Maps में पैदल मार्ग खोलें",
    dismiss: "खारिज करें",
    alreadyClaimedOrClosed:
      "यह अनुरोध पहले ही किसी अन्य मददगार ने स्वीकार कर लिया है या बंद हो चुका है।",
    outsideArea:
      "आप 500 मीटर के दायरे से बाहर हैं और इसे स्वीकार नहीं कर सकते।",
    staleLocation: "कृपया अपना स्थान रीफ़्रेश करें और पुनः प्रयास करें।",
    statusLabel: "अनुरोध की स्थिति",
    categoryLabel: "आपात श्रेणी",
  },
  kn: {
    title: "ಹತ್ತಿರದ ಸಮುದಾಯ ಸಹಾಯ",
    intro:
      "ಒಪ್ಪಿಗೆ ನೀಡಿದ ಸ್ವಯಂಸೇವಕರಿಗೆ 500 ಮೀಟರ್ ಒಳಗೆ ಸೂಚನೆ ಹೋಗಬಹುದು. ಇದು 108 ಅಥವಾ 112ಕ್ಕೆ ಪರ್ಯಾಯವಲ್ಲ.",
    disclaimer:
      "ಸಮುದಾಯ ಸಹಾಯವು ಸ್ವಯಂಪ್ರೇರಿತ ವೈಶಿಷ್ಟ್ಯವಾಗಿದ್ದು, ತುರ್ತು ರವಾನೆ ಸೇವೆಯಲ್ಲ. ಯಾವಾಗಲೂ ಮೊದಲು 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    helperTitle: "ಹತ್ತಿರದ ಸಹಾಯಕರಾಗಿ ನೋಂದಾಯಿಸಿ",
    helperDesc:
      "500 ಮೀ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಯಾರಿಗಾದರೂ ತುರ್ತು ಸಹಾಯ ಬೇಕಾದಾಗ ಸಾಮಾನ್ಯ ಸೂಚನೆ ಪಡೆಯಿರಿ.",
    enable: "ಸಹಾಯಕ ಸೂಚನೆಗಳನ್ನು ಆನ್ ಮಾಡಿ",
    stop: "ಲಭ್ಯತೆಯನ್ನು ಹಂಚುವುದನ್ನು ನಿಲ್ಲಿಸಿ",
    ready:
      "ನೀವು 15 ನಿಮಿಷಗಳವರೆಗೆ ಸಹಾಯಕ್ಕೆ ಲಭ್ಯವಿದ್ದೀರಿ. ನಿಮ್ಮ ಸ್ಥಳ ನವೀಕೃತವಾಗಿರಲು ಈ ಪುಟವನ್ನು ತೆರೆದಿಡಿ.",
    requestTitle: "ಹತ್ತಿರದವರಿಂದ ಸಹಾಯ ಕೇಳಿ",
    requestDesc:
      "500 ಮೀ ವ್ಯಾಪ್ತಿಯಲ್ಲಿರುವ ಸ್ವಯಂಸೇವಕರಿಗೆ ತಿಳಿಸಿ. ಸಹಾಯಕರು ಒಪ್ಪಿದ ನಂತರವೇ ನಿಖರ ಸ್ಥಳ ಹಂಚಲಾಗುತ್ತದೆ.",
    consent:
      "500 ಮೀ ವ್ಯಾಪ್ತಿಯಲ್ಲಿರುವ ಸಹಾಯಕರೊಂದಿಗೆ 10 ನಿಮಿಷಗಳವರೆಗೆ ನನ್ನ ಲೈವ್ GPS ಸ್ಥಳ ಮತ್ತು ತುರ್ತು ವರ್ಗವನ್ನು ಹಂಚಿಕೊಳ್ಳಲು ಒಪ್ಪುತ್ತೇನೆ. ನನ್ನ ಸಂಪೂರ್ಣ ಸಂದೇಶ ಹಂಚುವುದಿಲ್ಲ.",
    send: "ಹತ್ತಿರದವರಿಗೆ ಸೂಚನೆ ಕಳುಹಿಸಿ",
    sending: "ಸೂಚನೆ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
    sentWithCount:
      "{count} ಹತ್ತಿರದ ಸಹಾಯಕರಿಗೆ ಸೂಚನೆ ಕಳುಹಿಸುವ ಯತ್ನ ಸರದಿಯಲ್ಲಿದೆ. 108 ಅಥವಾ 112 ಲಭ್ಯವಾಗಿರಲಿ; ಪುಶ್ ತಲುಪುವುದು ಖಚಿತವಲ್ಲ.",
    noHelpers:
      "ಪ್ರಸ್ತುತ 500 ಮೀ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಯಾವುದೇ ಸಕ್ರಿಯ ಸಹಾಯಕರಿಲ್ಲ. ತಕ್ಷಣ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    waitingStatus: "ಸಹಾಯಕರು ಒಪ್ಪಿಕೊಳ್ಳುವುದಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ…",
    accepted:
      "ಹತ್ತಿರದ ಸಹಾಯಕರು ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ಸ್ವೀಕರಿಸಿದ್ದಾರೆ. ತುರ್ತು ಸೇವೆಗಳು (108/112) ನಿಮ್ಮ ಪ್ರಮುಖ ಆಧಾರವಾಗಿರಲಿ.",
    expired:
      "ಈ ವಿನಂತಿಯ ಸಮಯ ಮೀರಿದೆ (10 ನಿಮಿಷಗಳ ಮಿತಿ). ತುರ್ತು ಸಹಾಯಕ್ಕಾಗಿ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    cancelled: "ಈ ಸಹಾಯ ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.",
    cancel: "ವಿನಂತಿಯನ್ನು ರದ್ದುಮಾಡಿ",
    cancelling: "ರದ್ದುಗೊಳಿಸಲಾಗುತ್ತಿದೆ…",
    permissionDenied:
      "ಸೂಚನೆ ಅಥವಾ ಸ್ಥಳ ಅನುಮತಿಯನ್ನು ನಿರಾಕರಿಸಲಾಗಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಅನುಮತಿ ನೀಡಿ.",
    locationGpsRequired:
      "ಹತ್ತಿರದ ಸಹಾಯ ಕೇಳಲು ಲೈವ್ GPS ಸ್ಥಳ ಅಗತ್ಯವಿದೆ. ಅಂದಾಜು ಅಥವಾ ಹಸ್ತಚಾಲಿತ ಸ್ಥಳಗಳನ್ನು ಬಳಸಲಾಗುವುದಿಲ್ಲ.",
    configure: "ತಂಡವು HTTPS ಮತ್ತು VAPID push ಕೀಗಳನ್ನು ಹೊಂದಿಸಬೇಕು.",
    iosHint:
      "iPhone/iPad ನಲ್ಲಿ ವೆಬ್ ಪುಶ್ ಸಕ್ರಿಯಗೊಳಿಸಲು Safari ನಿಂದ ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ಗೆ ಸೇರಿಸಿ.",
    failure:
      "ಹತ್ತಿರದ ಸಹಾಯ ಸಂಪರ್ಕ ವಿಫಲವಾಯಿತು. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    accepting: "ಈ ವಿನಂತಿಯನ್ನು ಸ್ವೀಕರಿಸಿ",
    acceptBusy: "ಸ್ವೀಕರಿಸಲಾಗುತ್ತಿದೆ…",
    incomingTitle: "ಹತ್ತಿರದಿಂದ ಸಹಾಯದ ವಿನಂತಿ ಬಂದಿದೆ",
    incomingDesc:
      "500 ಮೀ ವ್ಯಾಪ್ತಿಯಲ್ಲಿರುವ ವ್ಯಕ್ತಿಯೊಬ್ಬರು ತುರ್ತು ಪರಿಸ್ಥಿತಿಗಾಗಿ ({category}) ಸಹಾಯ ಕೇಳಿದ್ದಾರೆ. ನೀವು ಒಪ್ಪಿದ ನಂತರವೇ ನಿಖರ ಸ್ಥಳ ಕಾಣಿಸುತ್ತದೆ.",
    claimedSuccess:
      "ವಿನಂತಿಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಕೆಳಗಿನ ಲಿಂಕ್ ಬಳಸಿ ಕಾಲುದಾರಿ ಮಾರ್ಗ ಅನುಸರಿಸಿ:",
    openMap: "Google Maps ನಲ್ಲಿ ಕಾಲುದಾರಿ ಮಾರ್ಗ ತೆರೆಯಿರಿ",
    dismiss: "ವಜಾಗೊಳಿಸಿ",
    alreadyClaimedOrClosed:
      "ಈ ವಿನಂತಿಯನ್ನು ಈಗಾಗಲೇ ಮತ್ತೊಬ್ಬ ಸಹಾಯಕರು ಸ್ವೀಕರಿಸಿದ್ದಾರೆ ಅಥವಾ ಮುಚ್ಚಲಾಗಿದೆ.",
    outsideArea:
      "ನೀವು 500 ಮೀ ವಿನಂತಿ ಪ್ರದೇಶದಿಂದ ಹೊರಗಿದ್ದೀರಿ ಮತ್ತು ಇದನ್ನು ಸ್ವೀಕರಿಸಲಾಗುವುದಿಲ್ಲ.",
    staleLocation: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ನವೀಕರಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    statusLabel: "ವಿನಂತಿಯ ಸ್ಥಿತಿ",
    categoryLabel: "ತುರ್ತು ವರ್ಗ",
  },
} as const;

function decodeBase64Key(key: string): Uint8Array {
  const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer;
}

function getGpsPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(new Error("geolocation_unavailable"));
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  });
}

function sanitizeCategory(val?: string): NearbyCategory {
  const known = new Set([
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
  return val && known.has(val) ? (val as NearbyCategory) : "general_unclear";
}

function formatCategoryName(category: string): string {
  return category.replaceAll("_", " ");
}

export default function NearbyHelp({
  location,
  category,
  language,
}: {
  location: Location | null;
  category?: string;
  language: Language;
}) {
  const locale = language === "hi" || language === "kn" ? language : "en";
  const copy = COPY[locale];

  const [config, setConfig] = useState<NearbyConfig | null>(null);
  const [helperToken, setHelperToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(HELPER_KEY) ?? "";
  });
  const [available, setAvailable] = useState(false);
  const [consent, setConsent] = useState(false);
  const [request, setRequest] = useState<NearbyRequestCreateResponse | null>(
    () => {
      if (typeof window === "undefined") return null;
      const stored = localStorage.getItem(REQUEST_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as NearbyRequestCreateResponse;
          if (parsed?.request_id && parsed?.requester_token) {
            return parsed;
          }
        } catch {
          localStorage.removeItem(REQUEST_KEY);
        }
      }
      return null;
    },
  );
  const [requestStatus, setRequestStatus] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem(REQUEST_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as NearbyRequestCreateResponse;
        return parsed?.status || "open";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [alertId, setAlertId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("nearbyRequest") ?? ""
    );
  });
  const [alertCategory, setAlertCategory] = useState<string>("general_unclear");
  const [alertMessage, setAlertMessage] = useState("");
  const [directionsUrl, setDirectionsUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isGpsLocation = Boolean(location && location.source === "gps");

  useEffect(() => {
    fetchNearbyConfig()
      .then(setConfig)
      .catch(() =>
        setConfig({
          enabled: false,
          public_key: null,
          radius_m: 500,
          request_ttl_seconds: 600,
          helper_ttl_seconds: 900,
          location_fresh_seconds: 180,
        }),
      );
  }, []);

  // Periodic location freshness update while helper is available
  useEffect(() => {
    if (!helperToken || !available) return;

    const refreshLocation = () => {
      getGpsPosition()
        .then((pos) => updateHelperAvailability(helperToken, pos))
        .catch(() => undefined);
    };

    void refreshLocation();
    const interval = window.setInterval(refreshLocation, 60_000);
    return () => window.clearInterval(interval);
  }, [helperToken, available]);

  // Polling for help request status
  useEffect(() => {
    if (
      !request ||
      ["claimed", "cancelled", "expired"].includes(requestStatus)
    ) {
      return;
    }

    let active = true;
    const checkStatus = async () => {
      try {
        const state = await getHelpRequestStatus(
          request.request_id,
          request.requester_token,
        );
        if (!active) return;
        setRequestStatus(state.status);
        if (state.status === "claimed") {
          setAlertMessage(copy.accepted);
        } else if (state.status === "expired") {
          setAlertMessage(copy.expired);
          localStorage.removeItem(REQUEST_KEY);
        } else if (state.status === "cancelled") {
          setAlertMessage(copy.cancelled);
          localStorage.removeItem(REQUEST_KEY);
        }
      } catch {
        if (active) setRequestStatus("unavailable");
      }
    };

    void checkStatus();
    const timer = window.setInterval(() => {
      if (Date.now() < request.expires_at * 1000) {
        void checkStatus();
      } else {
        setRequestStatus("expired");
        setAlertMessage(copy.expired);
        localStorage.removeItem(REQUEST_KEY);
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [request, requestStatus, copy.accepted, copy.expired, copy.cancelled]);

  // Helper registration and activation
  const enableHelpers = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const vapidKey = config?.public_key ?? config?.vapid_public_key;
      if (
        !config?.enabled ||
        !vapidKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        throw new Error(copy.configure);
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(copy.permissionDenied);
      }

      const position = await getGpsPosition().catch(() => {
        throw new Error(copy.locationGpsRequired);
      });

      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Key(
          vapidKey,
        ) as unknown as BufferSource,
      });

      const registered = await registerNearbyHelper(subscription);
      localStorage.setItem(HELPER_KEY, registered.helper_token);
      setHelperToken(registered.helper_token);

      await updateHelperAvailability(registered.helper_token, position);
      setAvailable(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failure);
    } finally {
      setBusy(false);
    }
  }, [config, copy]);

  // Stop sharing helper availability
  async function stopHelpers() {
    setBusy(true);
    setError("");
    try {
      if (helperToken) {
        await stopHelperAvailability(helperToken).catch(() => undefined);
      }
      setAvailable(false);
    } catch {
      setError(copy.failure);
    } finally {
      setBusy(false);
    }
  }

  // Requester sends nearby alert
  async function sendRequest() {
    if (!consent) {
      setError(copy.consent);
      return;
    }
    if (!location || location.source !== "gps") {
      setError(copy.locationGpsRequired);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const created = await createHelpRequest({
        lat: location.lat,
        lng: location.lng,
        category: sanitizeCategory(category),
        consent: true,
      });

      setRequest(created);
      setRequestStatus("open");
      if (created.alerts_queued > 0) {
        setAlertMessage(
          copy.sentWithCount.replace("{count}", String(created.alerts_queued)),
        );
      } else {
        setAlertMessage(copy.noHelpers);
      }
      localStorage.setItem(REQUEST_KEY, JSON.stringify(created));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failure);
    } finally {
      setBusy(false);
    }
  }

  // Helper accepts an alert
  async function acceptAlert() {
    if (!helperToken || !alertId) {
      setError(copy.enable);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const position = await getGpsPosition().catch(() => {
        throw new Error(copy.staleLocation);
      });

      // Renew fresh location with helper token first
      await updateHelperAvailability(helperToken, position);

      // Claim request
      const accepted = await claimHelpRequest(alertId, helperToken, position);
      setAvailable(false);
      setAlertCategory(accepted.category || "general_unclear");
      setAlertMessage(copy.claimedSuccess);
      setDirectionsUrl(accepted.directions_url);

      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : copy.failure;
      if (msg.includes("closed") || msg.includes("already accepted")) {
        setError(copy.alreadyClaimedOrClosed);
      } else if (msg.includes("500 m")) {
        setError(copy.outsideArea);
      } else if (msg.includes("Refresh your location")) {
        setError(copy.staleLocation);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  // Cancel an open request
  async function cancelRequest() {
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      await cancelHelpRequest(request.request_id, request.requester_token);
      setRequestStatus("cancelled");
      setAlertMessage(copy.cancelled);
      localStorage.removeItem(REQUEST_KEY);
      setRequest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failure);
    } finally {
      setBusy(false);
    }
  }

  function dismissIncomingAlert() {
    setAlertId("");
    setDirectionsUrl("");
    setError("");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  if (!config) return null;

  return (
    <section
      className="panel nearby-help-panel"
      aria-labelledby="nearby-help-title"
      style={{ marginTop: 24, padding: "20px 22px" }}
    >
      <div className="panel-heading" style={{ marginBottom: 12 }}>
        <div>
          <h2 id="nearby-help-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <span className="step-mark">500 m</span>
      </div>

      <div
        className="nearby-disclaimer"
        role="note"
        style={{
          display: "flex",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 10,
          background: "#fff9ea",
          border: "1px solid #fbe5ab",
          color: "#784b00",
          fontSize: 11,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        <span>⚠️</span>
        <span>{copy.disclaimer}</span>
      </div>

      {!config.enabled && (
        <div
          className="match-warning"
          role="alert"
          style={{ marginBottom: 16 }}
        >
          {copy.configure}
        </div>
      )}

      {/* Volunteer Helper Section */}
      <div
        className="nearby-section"
        style={{
          paddingBottom: 16,
          borderBottom: "1px solid #e3ebe7",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#102d3b",
            margin: "0 0 6px",
          }}
        >
          {copy.helperTitle}
        </h3>
        <p
          style={{
            fontSize: 11,
            color: "#526b70",
            margin: "0 0 10px",
            lineHeight: 1.5,
          }}
        >
          {copy.helperDesc}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            className="action-button"
            type="button"
            onClick={available ? stopHelpers : enableHelpers}
            disabled={busy || !config.enabled}
          >
            {busy ? copy.sending : available ? copy.stop : copy.enable}
          </button>
          <span
            className="verified-line"
            style={{ alignSelf: "center", fontSize: 11 }}
          >
            {available ? copy.ready : ""}
          </span>
        </div>
        <p
          style={{
            fontSize: 10,
            color: "#72888b",
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {copy.iosHint}
        </p>
      </div>

      {/* Requester Section */}
      <div className="nearby-section">
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#102d3b",
            margin: "0 0 6px",
          }}
        >
          {copy.requestTitle}
        </h3>
        <p
          style={{
            fontSize: 11,
            color: "#526b70",
            margin: "0 0 10px",
            lineHeight: 1.5,
          }}
        >
          {copy.requestDesc}
        </p>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            margin: "12px 0",
            color: "#3d575c",
            fontSize: 12,
            lineHeight: 1.5,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#087f72" }}
          />
          <span>{copy.consent}</span>
        </label>

        {!isGpsLocation && (
          <p
            className="verified-line"
            role="status"
            style={{ color: "#b92f3d", marginBottom: 10 }}
          >
            {copy.locationGpsRequired}
          </p>
        )}

        <button
          className="submit-button"
          type="button"
          onClick={sendRequest}
          disabled={busy || !config.enabled || !consent || !isGpsLocation}
        >
          {busy ? copy.sending : copy.send}
        </button>
      </div>

      {/* Active Request Status Panel */}
      {request && (
        <div
          className="match-warning"
          role="status"
          aria-live="polite"
          style={{ marginTop: 16 }}
        >
          <div>
            <strong>{copy.statusLabel}:</strong> {requestStatus || "open"}
            {alertMessage && (
              <p style={{ marginTop: 4, marginBlockEnd: 8 }}>{alertMessage}</p>
            )}
            {requestStatus === "open" && (
              <button
                type="button"
                className="prealert-copy-button"
                onClick={cancelRequest}
                disabled={busy}
                style={{ marginTop: 6 }}
              >
                {busy ? copy.cancelling : copy.cancel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Incoming Alert Card for Volunteer */}
      {alertId && (
        <div
          className="hospital-card"
          role="region"
          aria-label={copy.incomingTitle}
          style={{
            marginTop: 16,
            borderColor: "#087f72",
            background: "#f8fbf9",
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>
            {copy.incomingTitle}
          </h4>
          <p style={{ fontSize: 11, color: "#47626a", lineHeight: 1.5 }}>
            {copy.incomingDesc.replace(
              "{category}",
              formatCategoryName(alertCategory),
            )}
          </p>

          {!directionsUrl ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                className="submit-button"
                type="button"
                disabled={busy || !helperToken}
                onClick={acceptAlert}
                style={{ minHeight: 40, flex: 1 }}
              >
                {busy ? copy.acceptBusy : copy.accepting}
              </button>
              <button
                className="action-button"
                type="button"
                onClick={dismissIncomingAlert}
                disabled={busy}
              >
                {copy.dismiss}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#075d54",
                  marginBottom: 8,
                }}
              >
                {copy.claimedSuccess}
              </p>
              <a
                className="action-button"
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 700,
                  background: "#087f72",
                  color: "#fff",
                  borderColor: "#087f72",
                }}
              >
                📍 {copy.openMap}
              </a>
            </div>
          )}
        </div>
      )}

      {alertMessage && !request && !alertId && (
        <p
          className="verified-line"
          role="status"
          aria-live="polite"
          style={{ marginTop: 12 }}
        >
          {alertMessage}
        </p>
      )}

      {error && (
        <p className="error-text" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </section>
  );
}
