"use client";

import { useMemo, useState } from "react";
import type { Language, Location, TriageResponse } from "../lib/contracts";

const COPY = {
  en: { title: "Request an ambulance from this hospital", help: "Opens your SMS app with a draft. Review it and tap Send. If your phone does not prefill the message, copy the preview and paste it. SahayAI does not send or store it.", consent: "I agree to share the emergency category, age group, pickup coordinates and the callback number below with this hospital by SMS.", callback: "Callback number (optional)", contact: "Choose a publicly listed contact", preview: "Message preview", action: "Review and send SMS", noLocation: "Share your current GPS location to include a pickup pin.", noContact: "No usable phone number is listed for this hospital.", onlyIfListed: "An ambulance service is mentioned in public information; this does not confirm current availability or that this number reaches dispatch.", copied: "Message copied. Paste it into a message to the hospital.", copy: "Copy message", error: "Could not open or copy the message. Please call 108 or 112 for urgent help." },
  hi: { title: "इस अस्पताल से एम्बुलेंस माँगें", help: "आपका SMS ऐप एक ड्राफ़्ट खोलेगा। जाँचकर Send दबाएँ। संदेश न भरे तो preview कॉपी करके पेस्ट करें। SahayAI संदेश नहीं भेजता या सेव नहीं करता।", consent: "मैं आपात स्थिति की श्रेणी, आयु समूह, पिकअप स्थान और नीचे दिया callback नंबर इस अस्पताल से SMS द्वारा साझा करने की सहमति देता/देती हूँ।", callback: "Callback नंबर (वैकल्पिक)", contact: "सार्वजनिक रूप से दिए संपर्क चुनें", preview: "संदेश देखें", action: "जाँचें और SMS भेजें", noLocation: "पिकअप पिन जोड़ने के लिए अपना वर्तमान GPS स्थान साझा करें।", noContact: "इस अस्पताल के लिए उपयोगी फ़ोन नंबर उपलब्ध नहीं है।", onlyIfListed: "सार्वजनिक जानकारी में एम्बुलेंस सेवा का उल्लेख है; इससे अभी उपलब्धता या dispatch नंबर की पुष्टि नहीं होती।", copied: "संदेश कॉपी हुआ। इसे अस्पताल को भेजने के लिए पेस्ट करें।", copy: "संदेश कॉपी करें", error: "संदेश नहीं खुला/कॉपी हुआ। तुरंत सहायता के लिए 108 या 112 पर कॉल करें।" },
  kn: { title: "ಈ ಆಸ್ಪತ್ರೆಯಿಂದ ಆಂಬ್ಯುಲೆನ್ಸ್ ಕೇಳಿ", help: "ನಿಮ್ಮ SMS ಅಪ್ಲಿಕೇಶನ್ ಕರಡು ತೆರೆಯುತ್ತದೆ. ಪರಿಶೀಲಿಸಿ Send ಒತ್ತಿ. ಸಂದೇಶ ತುಂಬದಿದ್ದರೆ ಪೂರ್ವವೀಕ್ಷಣೆಯನ್ನು ನಕಲಿಸಿ ಅಂಟಿಸಿ. SahayAI ಸಂದೇಶ ಕಳುಹಿಸುವುದಿಲ್ಲ ಅಥವಾ ಉಳಿಸುವುದಿಲ್ಲ.", consent: "ತುರ್ತು ವರ್ಗ, ವಯೋಮಾನದ ಗುಂಪು, ಪಿಕಪ್ ಸ್ಥಳ ಮತ್ತು ಕೆಳಗಿನ callback ಸಂಖ್ಯೆಯನ್ನು ಈ ಆಸ್ಪತ್ರೆಯೊಂದಿಗೆ SMS ಮೂಲಕ ಹಂಚಲು ಒಪ್ಪುತ್ತೇನೆ.", callback: "Callback ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)", contact: "ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕ ಸಂಖ್ಯೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", preview: "ಸಂದೇಶ ಪೂರ್ವವೀಕ್ಷಣೆ", action: "ಪರಿಶೀಲಿಸಿ SMS ಕಳುಹಿಸಿ", noLocation: "ಪಿಕಪ್ ಪಿನ್ ಸೇರಿಸಲು ನಿಮ್ಮ ಪ್ರಸ್ತುತ GPS ಸ್ಥಳ ಹಂಚಿ.", noContact: "ಈ ಆಸ್ಪತ್ರೆಗೆ ಬಳಸಬಹುದಾದ ಫೋನ್ ಸಂಖ್ಯೆ ಇಲ್ಲ.", onlyIfListed: "ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿಯಲ್ಲಿ ಆಂಬ್ಯುಲೆನ್ಸ್ ಉಲ್ಲೇಖಿಸಲಾಗಿದೆ; ಪ್ರಸ್ತುತ ಲಭ್ಯತೆ ಅಥವಾ dispatch ಸಂಖ್ಯೆಯ ದೃಢೀಕರಣವಲ್ಲ.", copied: "ಸಂದೇಶ ನಕಲಿಸಲಾಗಿದೆ. ಆಸ್ಪತ್ರೆಯ ಸಂದೇಶದಲ್ಲಿ ಅಂಟಿಸಿ.", copy: "ಸಂದೇಶ ನಕಲಿಸಿ", error: "ಸಂದೇಶ ತೆರೆಯಲು/ನಕಲಿಸಲು ಆಗಲಿಲ್ಲ. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ." },
} as const;

function phoneOptions(raw: string | null | undefined) {
  if (!raw) return [];
  const parts = raw.match(/\+?\d[\d\s().\/-]{6,}\d/g) ?? [];
  const seen = new Set<string>();
  return parts.flatMap((part) => {
    const digits = part.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return [];
    const number = part.trim().startsWith("+")
      ? `+${digits}`
      : digits.length === 10
        ? `+91${digits}`
        : digits.length === 11 && digits.startsWith("0")
          ? `+91${digits.slice(1)}`
          : digits;
    if (seen.has(number)) return [];
    seen.add(number);
    return [number];
  });
}

export default function AmbulanceRequest({
  hospital,
  emergency,
  location,
  language,
}: {
  hospital: { name: string; phone?: string | null; services: string[] };
  emergency: TriageResponse["emergency"];
  location: Location | null;
  language: Language;
}) {
  const copy = COPY[language === "hi" || language === "kn" ? language : "en"];
  const contacts = useMemo(() => phoneOptions(hospital.phone), [hospital.phone]);
  const [selectedContact, setSelectedContact] = useState(contacts[0] ?? "");
  const [callback, setCallback] = useState("");
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const serviceListed = hospital.services.some((service) => /ambulance/i.test(service));
  const message = location
    ? [
        "SAHAYAI AMBULANCE REQUEST",
        `Emergency category: ${emergency.type.replaceAll("_", " ")}`,
        `Patient age group: ${emergency.age_group}`,
        `Pickup coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
        `Pickup map: https://www.google.com/maps/search/?api=1&query=${location.lat.toFixed(6)}%2C${location.lng.toFixed(6)}`,
        `Requested destination: ${hospital.name}`,
        "Please confirm ambulance availability, estimated arrival time, vehicle type and cost.",
        `Callback number: ${callback.trim() || "Please call the sender"}`,
      ].join("\n")
    : "";
  const smsHref = selectedContact && message
    ? `sms:${selectedContact}?body=${encodeURIComponent(message)}`
    : undefined;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setError("");
    } catch {
      setError(copy.error);
    }
  }

  if (!serviceListed) return null;
  return (
    <details className="prealert-panel" style={{ marginTop: 10 }}>
      <summary>{copy.title}</summary>
      <p className="verified-line">{copy.onlyIfListed}</p>
      <p className="verified-line">{copy.help}</p>
      {!location && <p className="match-warning">{copy.noLocation}</p>}
      {contacts.length === 0 ? (
        <p className="match-warning">{copy.noContact}</p>
      ) : (
        <>
          <label className="field-label" htmlFor={`ambulance-contact-${hospital.name}`}>
            {copy.contact}
          </label>
          <select
            id={`ambulance-contact-${hospital.name}`}
            className="location-select"
            value={selectedContact}
            onChange={(event) => setSelectedContact(event.target.value)}
          >
            {contacts.map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
          <label className="field-label" htmlFor={`ambulance-callback-${hospital.name}`} style={{ marginTop: 10 }}>
            {copy.callback}
          </label>
          <input
            id={`ambulance-callback-${hospital.name}`}
            className="location-select"
            type="tel"
            autoComplete="tel"
            value={callback}
            onChange={(event) => setCallback(event.target.value.replace(/[^\d+() -]/g, "").slice(0, 24))}
            placeholder="+91 …"
          />
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "12px 0", color: "#526b70", fontSize: 12, lineHeight: 1.5 }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            {copy.consent}
          </label>
          {consent && message && <><p className="verified-line">{copy.preview}</p><pre className="prealert-panel">{message}</pre></>}
          <div className="action-row">
            {smsHref ? <a className="action-button" href={consent ? smsHref : undefined} aria-disabled={!consent} onClick={(event) => { if (!consent) event.preventDefault(); }}>
              {copy.action}
            </a> : <span className="action-button disabled" aria-disabled="true">{copy.noLocation}</span>}
            <button className="action-button" type="button" disabled={!consent || !message} onClick={copyMessage}>{copied ? copy.copied : copy.copy}</button>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </>
      )}
    </details>
  );
}

