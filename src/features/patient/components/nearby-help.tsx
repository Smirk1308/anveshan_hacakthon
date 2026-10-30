"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, Location } from "../lib/contracts";

const API = process.env.NEXT_PUBLIC_TRIAGE_API_URL?.replace(/\/$/, "") ?? "";
const HELPER_KEY = "sahayai.nearby.helper-token";
const REQUEST_KEY = "sahayai.nearby.request";
const COPY = {
  en: { title: "Nearby community help", intro: "Opt-in alerts can reach helpers within 500 m. This does not replace 108 or 112.", helper: "I can help nearby", enable: "Turn on helper alerts", stop: "Stop sharing availability", ready: "You are available to help for up to 15 minutes. Keep this page open so your location stays current.", request: "Ask nearby people for help", consent: "I agree to share my live location and emergency category with opted-in helpers nearby for up to 10 minutes. My full description will not be sent.", send: "Send nearby alert", sent: "Alert sent. Keep 108 or 112 available; push delivery is not guaranteed.", noHelpers: "No nearby helpers received the alert yet. Call 108 or 112 if help is urgent.", accepted: "A helper accepted. Use the route below and keep emergency services available.", cancel: "Cancel request", dismissed: "Request closed.", permission: "Enable notifications and location to use nearby help.", location: "Location is unavailable. Allow GPS and try again.", configure: "Nearby alerts need HTTPS and VAPID push keys configured by the team.", failure: "Could not connect to nearby help. Please call 108 or 112 for urgent assistance.", accepting: "Accept this request", opened: "A nearby person requested help. Your exact location is shared with them only after you accept.", busy: "Working…", status: "Request status", nearby: "Nearby helper alerts", exact: "The exact pin is shared only after a helper accepts." },
  hi: { title: "आस-पास सामुदायिक सहायता", intro: "सहमति देने वाले मददगारों को 500 मीटर के भीतर सूचना जा सकती है। यह 108 या 112 का विकल्प नहीं है।", helper: "मैं आसपास मदद कर सकता/सकती हूँ", enable: "मददगार सूचनाएँ चालू करें", stop: "उपलब्धता साझा करना बंद करें", ready: "आप 15 मिनट तक मदद के लिए उपलब्ध हैं। स्थान अपडेट रखने के लिए यह पेज खुला रखें।", request: "आसपास के लोगों से मदद माँगें", consent: "मैं अपना लाइव स्थान और आपात स्थिति की श्रेणी 10 मिनट तक आसपास के मददगारों से साझा करने की सहमति देता/देती हूँ। मेरा पूरा संदेश साझा नहीं होगा।", send: "आसपास सूचना भेजें", sent: "सूचना भेजी गई। 108 या 112 उपलब्ध रखें; सूचना पहुँचने की गारंटी नहीं है।", noHelpers: "अभी तक आसपास किसी मददगार तक सूचना नहीं पहुँची। तुरंत मदद के लिए 108 या 112 पर कॉल करें।", accepted: "एक मददगार ने अनुरोध स्वीकार किया। नीचे मार्ग देखें और आपात सेवाएँ उपलब्ध रखें।", cancel: "अनुरोध रद्द करें", dismissed: "अनुरोध बंद हो गया।", permission: "आसपास मदद के लिए सूचनाएँ और स्थान अनुमति दें।", location: "स्थान उपलब्ध नहीं है। GPS अनुमति देकर फिर प्रयास करें।", configure: "टीम को HTTPS और VAPID push keys सेट करनी होंगी।", failure: "आसपास सहायता से जुड़ नहीं सका। तुरंत मदद के लिए 108 या 112 पर कॉल करें।", accepting: "यह अनुरोध स्वीकार करें", opened: "पास के व्यक्ति ने मदद माँगी है। स्वीकार करने के बाद ही आपका सटीक स्थान उनसे साझा होगा।", busy: "प्रक्रिया जारी…", status: "अनुरोध की स्थिति", nearby: "आसपास मददगार सूचनाएँ", exact: "सटीक स्थान केवल मददगार के स्वीकार करने के बाद साझा होगा।" },
  kn: { title: "ಹತ್ತಿರದ ಸಮುದಾಯ ಸಹಾಯ", intro: "ಒಪ್ಪಿಗೆ ನೀಡಿದ ಸಹಾಯಕರಿಗೆ 500 ಮೀಟರ್ ಒಳಗೆ ಸೂಚನೆ ಹೋಗಬಹುದು. ಇದು 108 ಅಥವಾ 112ಕ್ಕೆ ಪರ್ಯಾಯವಲ್ಲ.", helper: "ನಾನು ಹತ್ತಿರದಲ್ಲಿ ಸಹಾಯ ಮಾಡಬಹುದು", enable: "ಸಹಾಯಕ ಸೂಚನೆಗಳನ್ನು ಆನ್ ಮಾಡಿ", stop: "ಲಭ್ಯತೆಯನ್ನು ಹಂಚುವುದನ್ನು ನಿಲ್ಲಿಸಿ", ready: "ನೀವು 15 ನಿಮಿಷಗಳವರೆಗೆ ಸಹಾಯಕ್ಕೆ ಲಭ್ಯ. ಸ್ಥಳ ನವೀಕರಣಕ್ಕೆ ಈ ಪುಟವನ್ನು ತೆರೆದಿಡಿ.", request: "ಹತ್ತಿರದವರಿಂದ ಸಹಾಯ ಕೇಳಿ", consent: "ನನ್ನ ನೇರ ಸ್ಥಳ ಮತ್ತು ತುರ್ತು ವರ್ಗವನ್ನು 10 ನಿಮಿಷಗಳವರೆಗೆ ಹತ್ತಿರದ ಒಪ್ಪಿಗೆ ನೀಡಿದ ಸಹಾಯಕರೊಂದಿಗೆ ಹಂಚಲು ಒಪ್ಪುತ್ತೇನೆ. ನನ್ನ ಸಂಪೂರ್ಣ ಸಂದೇಶ ಹಂಚುವುದಿಲ್ಲ.", send: "ಹತ್ತಿರದವರಿಗೆ ಸೂಚನೆ ಕಳುಹಿಸಿ", sent: "ಸೂಚನೆ ಕಳುಹಿಸಲಾಗಿದೆ. 108 ಅಥವಾ 112 ಲಭ್ಯವಾಗಿರಲಿ; ಪುಶ್ ತಲುಪುವುದು ಖಚಿತವಲ್ಲ.", noHelpers: "ಇನ್ನೂ ಹತ್ತಿರದ ಸಹಾಯಕರಿಗೆ ಸೂಚನೆ ತಲುಪಿಲ್ಲ. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.", accepted: "ಒಬ್ಬ ಸಹಾಯಕ ಒಪ್ಪಿಕೊಂಡಿದ್ದಾರೆ. ಕೆಳಗಿನ ಮಾರ್ಗ ಬಳಸಿ; ತುರ್ತು ಸೇವೆಗಳನ್ನು ಲಭ್ಯವಾಗಿರಿಸಿ.", cancel: "ವಿನಂತಿಯನ್ನು ರದ್ದುಮಾಡಿ", dismissed: "ವಿನಂತಿ ಮುಚ್ಚಲಾಗಿದೆ.", permission: "ಹತ್ತಿರದ ಸಹಾಯಕ್ಕೆ ಸೂಚನೆ ಮತ್ತು ಸ್ಥಳ ಅನುಮತಿ ನೀಡಿ.", location: "ಸ್ಥಳ ಲಭ್ಯವಿಲ್ಲ. GPS ಅನುಮತಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", configure: "ತಂಡವು HTTPS ಮತ್ತು VAPID push ಕೀಗಳನ್ನು ಹೊಂದಿಸಬೇಕು.", failure: "ಹತ್ತಿರದ ಸಹಾಯ ಸಂಪರ್ಕ ವಿಫಲವಾಯಿತು. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.", accepting: "ಈ ವಿನಂತಿಯನ್ನು ಸ್ವೀಕರಿಸಿ", opened: "ಹತ್ತಿರದವರು ಸಹಾಯ ಕೇಳಿದ್ದಾರೆ. ನೀವು ಒಪ್ಪಿದ ನಂತರವೇ ನಿಖರ ಸ್ಥಳ ಹಂಚಲಾಗುತ್ತದೆ.", busy: "ಕಾರ್ಯನಡೆಯುತ್ತಿದೆ…", status: "ವಿನಂತಿಯ ಸ್ಥಿತಿ", nearby: "ಹತ್ತಿರದ ಸಹಾಯಕ ಸೂಚನೆಗಳು", exact: "ಸಹಾಯಕ ಒಪ್ಪಿದ ನಂತರವೇ ನಿಖರ ಸ್ಥಳ ಹಂಚಲಾಗುತ್ತದೆ." },
} as const;

type Config = { enabled: boolean; vapid_public_key: string | null };
type CreatedRequest = { request_id: string; requester_token: string; alerts_queued: number; expires_at: number };

function decodeKey(key: string): Uint8Array {
  const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  });
}

async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  if (!API) throw new Error("API unavailable");
  const response = await fetch(`${API}/api/nearby${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail ?? "Nearby request failed");
  return data as T;
}

function categoryTag(value: string | undefined) {
  const known = new Set(["poisoning_ingestion", "burns", "snake_bite", "cardiac", "stroke", "trauma_accident", "severe_bleeding", "obstetric", "pediatric_emergency", "breathing_difficulty", "seizure", "allergic_reaction", "electric_shock_drowning", "minor_injury_fracture", "general_unclear"]);
  return value && known.has(value) ? value : "general_unclear";
}

export default function NearbyHelp({ location, category, language }: { location: Location | null; category?: string; language: Language }) {
  const locale = language === "hi" || language === "kn" ? language : "en";
  const copy = COPY[locale];
  const [config, setConfig] = useState<Config | null>(null);
  const [helperToken, setHelperToken] = useState("");
  const [available, setAvailable] = useState(false);
  const [consent, setConsent] = useState(false);
  const [request, setRequest] = useState<CreatedRequest | null>(null);
  const [requestStatus, setRequestStatus] = useState("");
  const [alertId, setAlertId] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    setHelperToken(localStorage.getItem(HELPER_KEY) ?? "");
    api<Config>("/config").then(setConfig).catch(() => setConfig({ enabled: false, vapid_public_key: null }));
    const queryId = new URLSearchParams(window.location.search).get("nearbyRequest");
    if (queryId) setAlertId(queryId);
    const stored = localStorage.getItem(REQUEST_KEY);
    if (stored) {
      try { setRequest(JSON.parse(stored) as CreatedRequest); } catch { localStorage.removeItem(REQUEST_KEY); }
    }
  }, []);

  useEffect(() => {
    if (!helperToken || !available) return;
    const update = () => getPosition().then((position) => api("/helpers/availability", helperToken, position)).catch(() => undefined);
    void update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [helperToken, available]);

  useEffect(() => {
    if (!request) return;
    let active = true;
    const refresh = async () => {
      try {
        const state = await api<{ status: string; helper_accepted?: boolean }>(`/requests/${request.request_id}`, request.requester_token);
        if (!active) return;
        setRequestStatus(state.status);
        if (["claimed", "cancelled", "expired"].includes(state.status)) {
          if (state.status === "claimed") setAlertMessage(copy.accepted);
          if (state.status !== "claimed") localStorage.removeItem(REQUEST_KEY);
        }
      } catch { if (active) setRequestStatus("unavailable"); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (Date.now() < request.expires_at * 1000) void refresh(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [request, copy.accepted]);

  useEffect(() => () => { if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current); }, []);

  const enableHelpers = useCallback(async () => {
    setBusy(true); setError("");
    try {
      if (!config?.enabled || !config.vapid_public_key || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error(copy.configure);
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error(copy.permission);
      const position = await getPosition();
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.vapid_public_key) });
      const registered = await api<{ helper_token: string }>("/helpers/register", undefined, subscription.toJSON());
      if (!registered.helper_token) throw new Error(copy.failure);
      localStorage.setItem(HELPER_KEY, registered.helper_token);
      setHelperToken(registered.helper_token);
      await api("/helpers/availability", registered.helper_token, position);
      setAvailable(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failure); }
    finally { setBusy(false); }
  }, [config, copy]);

  async function stopHelpers() {
    setBusy(true);
    try { await api("/helpers/stop", helperToken, {}); setAvailable(false); }
    catch { setError(copy.failure); }
    finally { setBusy(false); }
  }

  async function sendRequest() {
    if (!consent || !location || location.source !== "gps") { setError(copy.location); return; }
    setBusy(true); setError("");
    try {
      const created = await api<CreatedRequest>("/requests", undefined, { lat: location.lat, lng: location.lng, category: categoryTag(category), consent: true });
      setRequest(created); setRequestStatus("open"); setAlertMessage(created.alerts_queued > 0 ? copy.sent : copy.noHelpers);
      localStorage.setItem(REQUEST_KEY, JSON.stringify(created));
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failure); }
    finally { setBusy(false); }
  }

  async function acceptAlert() {
    if (!helperToken || !alertId) { setError(copy.enable); return; }
    setBusy(true); setError("");
    try {
      const position = await getPosition();
      await api("/helpers/availability", helperToken, position);
      const accepted = await api<{ directions_url: string }>(`/requests/${alertId}/claim`, helperToken, position);
      setAvailable(false);
      setAlertMessage(copy.accepted);
      window.open(accepted.directions_url, "_blank", "noopener,noreferrer");
      window.history.replaceState({}, "", window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failure); }
    finally { setBusy(false); }
  }

  async function cancelRequest() {
    if (!request) return;
    setBusy(true);
    try { await api(`/requests/${request.request_id}/cancel`, request.requester_token, {}); setRequestStatus("cancelled"); setAlertMessage(copy.dismissed); localStorage.removeItem(REQUEST_KEY); setRequest(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : copy.failure); }
    finally { setBusy(false); }
  }

  if (!config) return null;
  return (
    <section className="panel" aria-labelledby="nearby-help-title" style={{ marginTop: 18, padding: "20px 22px" }}>
      <div className="panel-heading" style={{ marginBottom: 10 }}>
        <div><h2 id="nearby-help-title">{copy.title}</h2><p>{copy.intro}</p></div>
        <span className="step-mark">500 m</span>
      </div>
      {!config.enabled && <p className="match-warning">{copy.configure}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <button className="action-button" type="button" onClick={available ? stopHelpers : enableHelpers} disabled={busy || !config.enabled}>
          {busy ? copy.busy : available ? copy.stop : copy.enable}
        </button>
        <span className="verified-line" style={{ alignSelf: "center" }}>{available ? copy.ready : copy.helper}</span>
      </div>
      <div style={{ marginTop: 18, borderTop: "1px solid #e3ebe7", paddingTop: 15 }}>
        <strong>{copy.request}</strong>
        <label style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "10px 0", color: "#526b70", fontSize: 12, lineHeight: 1.5 }}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{copy.consent}
        </label>
        {!location && <p className="verified-line">{copy.location}</p>}
        <p className="verified-line">{copy.exact}</p>
        <button className="submit-button" type="button" onClick={sendRequest} disabled={busy || !config.enabled || !consent || !location || location.source !== "gps"}>
          {busy ? copy.busy : copy.send}
        </button>
      </div>
      {request && <div className="match-warning" role="status" style={{ marginTop: 12 }}><strong>{copy.status}:</strong> {requestStatus || "open"}. {alertMessage}<br /><button type="button" className="prealert-copy-button" onClick={cancelRequest} disabled={busy || requestStatus === "claimed"}>{copy.cancel}</button></div>}
      {alertId && <div className="hospital-card" style={{ marginTop: 14 }}><strong>{copy.opened}</strong><div style={{ marginTop: 10 }}><button className="submit-button" type="button" disabled={busy || !helperToken} onClick={acceptAlert}>{busy ? copy.busy : copy.accepting}</button></div></div>}
      {alertMessage && !request && <p className="verified-line" role="status" style={{ marginTop: 10 }}>{alertMessage}</p>}
      {error && <p className="error-text" role="alert">{error || copy.location}</p>}
    </section>
  );
}

