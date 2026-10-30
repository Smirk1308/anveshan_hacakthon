"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { requestTriage } from "../lib/api";
import { HospitalMatch, Location, TriageResponse } from "../lib/contracts";

const mysuruCenter = { lat: 12.2958, lng: 76.6394 };
const areas = [
  {
    id: "center",
    label: "Mysuru city centre · approx.",
    lat: 12.2958,
    lng: 76.6394,
  },
  {
    id: "vijayanagar",
    label: "Vijayanagar · approx.",
    lat: 12.3404,
    lng: 76.6154,
  },
  {
    id: "kuvempunagar",
    label: "Kuvempunagar · approx.",
    lat: 12.2764,
    lng: 76.6361,
  },
  { id: "nazarbad", label: "Nazarbad · approx.", lat: 12.3105, lng: 76.6617 },
  { id: "hebbal", label: "Hebbal · approx.", lat: 12.3513, lng: 76.6104 },
];
const examples = [
  {
    label: "Possible poisoning",
    text: "My friend may have swallowed poison. He is conscious.",
  },
  { label: "Snake bite", text: "My father was bitten by a snake." },
  { label: "Chest pain", text: "My friend has chest pain and sweating." },
  {
    label: "Breathing difficulty",
    text: "Someone is having trouble breathing.",
  },
];
function Icon({ name, className = "" }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "pin")
    return (
      <svg {...common}>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  if (name === "shield")
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  if (name === "phone")
    return (
      <svg {...common}>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z" />
      </svg>
    );
  if (name === "route")
    return (
      <svg {...common}>
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h2a4 4 0 0 0 4-4V9a4 4 0 0 1 4-4" />
      </svg>
    );
  if (name === "copy")
    return (
      <svg {...common}>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </svg>
    );
  if (name === "spark")
    return (
      <svg {...common}>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
        <path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" />
      </svg>
    );
  if (name === "alert")
    return (
      <svg {...common}>
        <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 3h.01" />
      </svg>
    );
  if (name === "clock")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function safeMapsUrl(match: HospitalMatch, location: Location) {
  if (match.directions_url) return match.directions_url;
  const origin = encodeURIComponent(location.lat + "," + location.lng);
  const destination = encodeURIComponent(
    match.hospital.lat + "," + match.hospital.lng,
  );
  return (
    "https://www.google.com/maps/dir/?api=1&origin=" +
    origin +
    "&destination=" +
    destination +
    "&travelmode=driving"
  );
}

export default function EmergencyFinder() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<Location>({
    ...mysuruCenter,
    source: "manual",
    label: "Mysuru city centre · approximate",
  });
  const [locationStatus, setLocationStatus] = useState(
    "Location not shared · choose an approximate area",
  );
  const [response, setResponse] = useState<TriageResponse | null>(null);
  const [isDemo, setIsDemo] = useState(!process.env.NEXT_PUBLIC_TRIAGE_API_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const manualLocationChosen = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (manualLocationChosen.current) return;
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "gps",
          label: "Current location · coordinates hidden",
        });
        setLocationStatus("Using your current location");
      },
      () => {
        if (!manualLocationChosen.current)
          setLocationStatus("Location not shared · choose an approximate area");
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
    );
  }, []);

  const hasRedFlag = Boolean(response?.emergency.red_flags.length);
  const demoModeConfigured = !process.env.NEXT_PUBLIC_TRIAGE_API_URL;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCopied(false);
    if (query.trim().length < 2) {
      setError(
        "Briefly describe what happened so we can find a suitable hospital.",
      );
      return;
    }
    setLoading(true);
    try {
      const result = await requestTriage(query, location);
      setResponse(result.data);
      setIsDemo(result.demo);
    } catch {
      setError(
        "We could not process that request. You can still call 108 or 112 above.",
      );
    } finally {
      setLoading(false);
    }
  }

  function selectArea(areaId: string) {
    const area = areas.find((item) => item.id === areaId) ?? areas[0];
    manualLocationChosen.current = true;
    setLocation({
      lat: area.lat,
      lng: area.lng,
      source: "manual",
      label: area.label,
    });
    setLocationStatus("Approximate area selected");
  }

  async function copyPreAlert() {
    if (!response?.recommendation?.hospital.verified) return;
    try {
      await navigator.clipboard.writeText(response.pre_alert_text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(
        "Clipboard access is unavailable in this browser. Please try again.",
      );
    }
  }

  const recommendation = response?.recommendation ?? null;
  const showDemoNotice = isDemo || demoModeConfigured;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" aria-label="SahayAI home">
            <div className="brand-mark">S</div>
            <div>
              <div className="brand-name">SahayAI</div>
              <div className="brand-caption">Emergency hospital finder</div>
            </div>
          </div>
          <nav className="hotline-actions" aria-label="Emergency phone numbers">
            <a className="hotline-link primary" href="tel:108">
              <Icon name="phone" />
              <span>Call 108</span>
              <span className="hotline-number">Ambulance</span>
            </a>
            <a className="hotline-link" href="tel:112">
              <Icon name="phone" />
              <span>Call 112</span>
              <span className="hotline-number">Emergency</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="main-wrap">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Mysuru emergency support
            </div>
            <h1>
              Right hospital.
              <br />
              <span>First time.</span>
            </h1>
            <p className="hero-copy">
              Describe what happened. SahayAI helps find a nearby hospital by
              the care it may provide—not distance alone.
            </p>
          </div>
          <div className="prototype-badge">24-hour hackathon prototype</div>
        </section>

        {showDemoNotice && (
          <div className="notice" role="status">
            <strong>Demo mode:</strong> Hospital records are synthetic examples
            and are not verified. Do not call or navigate to these sample
            hospitals. For a real emergency, call 108 or 112.
          </div>
        )}

        {hasRedFlag && (
          <div className="emergency-banner" role="alert">
            <Icon name="alert" className="alert-icon" />
            <div>
              <strong>This sounds life-threatening. Call 108 now.</strong>
              <p>
                Do not wait for a hospital match. Call emergency services first.
              </p>
            </div>
          </div>
        )}

        <div className={"content-grid" + (response ? " has-response" : "")}>
          <section
            className="panel form-panel"
            aria-labelledby="situation-heading"
          >
            <div className="panel-heading">
              <div>
                <h2 id="situation-heading">What happened?</h2>
                <p>Share only what is needed to find a suitable hospital.</p>
              </div>
              <span className="step-mark">01 / 02</span>
            </div>

            <form onSubmit={submit}>
              <label className="field-label" htmlFor="area-select">
                Your location{" "}
                <span className="field-help">Used for this search only</span>
              </label>
              <div className="location-row">
                <div className="location-status">
                  <Icon name="pin" />
                  <span className="location-text">
                    {locationStatus === "Using your current location"
                      ? location.label
                      : locationStatus}
                  </span>
                </div>
                <label className="sr-only" htmlFor="area-select">
                  Choose approximate Mysuru area
                </label>
                <select
                  id="area-select"
                  className="location-select"
                  value={
                    areas.find(
                      (area) =>
                        area.lat === location.lat && area.lng === location.lng,
                    )?.id ?? ""
                  }
                  onChange={(event) => selectArea(event.target.value)}
                  aria-label="Choose approximate Mysuru area"
                >
                  <option value="" disabled>
                    Choose area
                  </option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </select>
              </div>
              {location.source === "manual" && (
                <p className="location-note">
                  Approximate demo area; results may be inaccurate. Location is
                  not saved.
                </p>
              )}

              <label className="field-label" htmlFor="situation-input">
                Describe the emergency{" "}
                <span className="field-help">English · हिन्दी · ಕನ್ನಡ</span>
              </label>
              <textarea
                id="situation-input"
                className="situation-input"
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 500))}
                maxLength={500}
                placeholder="For example: My friend may have swallowed poison. He is conscious."
                aria-describedby="input-hint"
              />
              <div className="input-meta">
                <span id="input-hint">No diagnosis or treatment advice</span>
                <span>{query.length}/500</span>
              </div>

              <div className="examples">
                <p className="example-label">Try a demo example</p>
                <div className="chip-row">
                  {examples.map((example) => (
                    <button
                      key={example.label}
                      className="example-chip"
                      type="button"
                      onClick={() => setQuery(example.text)}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="submit-button"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spinner"
                      style={{
                        width: 17,
                        height: 17,
                        borderWidth: 2,
                        borderColor: "rgba(6,32,30,.2)",
                        borderTopColor: "#06201e",
                      }}
                    />{" "}
                    Finding a suitable hospital…
                  </>
                ) : (
                  <>
                    <Icon name="spark" /> Find the right hospital
                  </>
                )}
              </button>
              <p className="privacy-note">
                <Icon name="shield" /> Your situation and location are not saved
                by this screen.
              </p>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>

          <section
            className="panel results-panel"
            aria-labelledby="results-heading"
            aria-live="polite"
          >
            <div className="results-header">
              <div className="results-title">
                <div className="result-icon">
                  <Icon name="spark" />
                </div>
                <div>
                  <h2 id="results-heading">Hospital match</h2>
                  <p>
                    {response
                      ? "Based on reported capabilities and distance"
                      : "A clear recommendation, with backups"}
                  </p>
                </div>
              </div>
              <span className="result-mode">
                {response ? (isDemo ? "Demo" : "Matched") : "Ready"}
              </span>
            </div>

            {loading ? (
              <div className="loading-state">
                <div className="spinner" />
                <strong>Finding a suitable hospital…</strong>
                <p>Call 108 remains available above.</p>
              </div>
            ) : !response ? (
              <div className="empty-state">
                <div className="empty-art">
                  <Icon name="route" />
                </div>
                <h3>One clear next step</h3>
                <p>
                  Tell us what happened to see a capability-matched hospital and
                  two alternatives.
                </p>
              </div>
            ) : (
              <div className="results-content">
                {response.warnings.map((warning) => (
                  <div key={warning} className="match-warning">
                    {warning}
                  </div>
                ))}
                {recommendation ? (
                  <>
                    <div className="recommend-label">
                      <Icon name="check" /> Most suitable based on capability
                      and distance
                    </div>
                    <HospitalCard
                      match={recommendation}
                      location={location}
                      primary
                      onCopy={copyPreAlert}
                      copied={copied}
                    />
                    {response.alternatives.length > 0 && (
                      <>
                        <div className="backup-heading">
                          <span>Two backups</span>
                          <span>Call ahead when possible</span>
                        </div>
                        <div className="backup-list">
                          {response.alternatives.slice(0, 2).map((match) => (
                            <HospitalCard
                              key={match.hospital.id}
                              match={match}
                              location={location}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    <p className="followup-note">
                      If an ambulance is delayed or the patient is getting
                      worse, go to emergency care now. Do not wait for this
                      screen.
                    </p>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-art">
                      <Icon name="alert" />
                    </div>
                    <h3>No hospital result</h3>
                    <p>
                      Call 108 now. You can try again or choose an approximate
                      area.
                    </p>
                  </div>
                )}
                <div className="disclaimer">
                  SahayAI helps you choose a suitable hospital. It does not
                  diagnose or give medical advice.{" "}
                  {isDemo
                    ? "Sample records are synthetic and unverified."
                    : "Hospital information may change; call the hospital if you can."}{" "}
                  In an emergency, call 108.
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="footer">
        SahayAI assists your decision; it does not replace 108, paramedics, or
        doctors.
      </footer>
    </div>
  );
}

function HospitalCard({
  match,
  location,
  primary = false,
  onCopy,
  copied = false,
}: {
  match: HospitalMatch;
  location: Location;
  primary?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  const hospital = match.hospital;
  const callHref =
    hospital.verified && hospital.phone
      ? match.call_url || "tel:" + hospital.phone
      : undefined;
  const canNavigate = hospital.verified;
  return (
    <article className={"hospital-card" + (primary ? "" : " backup")}>
      <div className="hospital-topline">
        <div>
          <h3 className="hospital-name">{hospital.name}</h3>
          <p className="hospital-address">{hospital.address}</p>
        </div>
        {!hospital.verified && (
          <span className="sample-badge">Sample · unverified</span>
        )}
      </div>
      <div className="hospital-metrics">
        <span className="metric">
          <Icon name="pin" /> {match.distance_km.toFixed(1)} km
        </span>
        <span className="metric">
          <Icon name="clock" /> approx. {match.eta_min_approx} min
        </span>
      </div>
      <div className="reason-list">
        {match.reasons.map((reason) => (
          <span key={reason} className="reason-pill">
            {reason}
          </span>
        ))}
      </div>
      <p className="verified-line">
        Last verified:{" "}
        <strong>{hospital.last_verified || "Not verified"}</strong>
      </p>
      <div className="action-row">
        {callHref ? (
          <a className="action-button" href={callHref}>
            <Icon name="phone" /> Call hospital
          </a>
        ) : (
          <span
            className="action-button disabled"
            aria-disabled="true"
            title="This sample has no verified phone number"
          >
            <Icon name="phone" /> Call unavailable
          </span>
        )}
        {canNavigate ? (
          <a
            className="action-button"
            href={safeMapsUrl(match, location)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="route" /> Navigate
          </a>
        ) : (
          <span
            className="action-button disabled"
            aria-disabled="true"
            title="Sample locations cannot be used for navigation"
          >
            <Icon name="route" /> Navigate unavailable
          </span>
        )}
        {primary &&
          (hospital.verified ? (
            <button
              className="action-button copy"
              type="button"
              onClick={onCopy}
            >
              <Icon name="copy" />{" "}
              {copied ? "Pre-alert copied" : "Copy pre-alert"}
            </button>
          ) : (
            <span
              className="action-button copy disabled"
              aria-disabled="true"
              title="Pre-alert sending is disabled for sample hospitals"
            >
              <Icon name="copy" /> Pre-alert unavailable for sample
            </span>
          ))}
      </div>
    </article>
  );
}
