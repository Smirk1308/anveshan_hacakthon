"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { requestTriage } from "../lib/api";
import { getUiCopy } from "../lib/ui-copy";
import {
  HospitalMatch,
  Language,
  Location,
  TriageResponse,
} from "../lib/contracts";

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
    text: "My friend may have swallowed poison. He is conscious.",
  },
  { text: "My father was bitten by a snake." },
  { text: "My friend has chest pain and sweating." },
  {
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

const heroVideoSrc = process.env.NEXT_PUBLIC_HERO_VIDEO_URL?.trim();

function HeroMedia() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !heroVideoSrc) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (preference.matches) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    };

    syncPlayback();
    preference.addEventListener("change", syncPlayback);
    return () => preference.removeEventListener("change", syncPlayback);
  }, []);

  return (
    <div className="hero-media" aria-hidden="true">
      {heroVideoSrc && (
        <video
          ref={videoRef}
          className="hero-video"
          muted
          loop
          playsInline
          preload="none"
          poster="/hero-atmosphere.svg"
          src={heroVideoSrc}
        ></video>
      )}
      <div className="hero-media-shade" />
      <div className="hero-map-mark">
        <span className="hero-map-ring" />
        <span className="hero-map-dot" />
      </div>
    </div>
  );
}

export default function EmergencyFinder() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<Location>({
    ...mysuruCenter,
    source: "manual",
    label: "Mysuru city centre · approximate",
  });
  const [locationStatus, setLocationStatus] = useState<
    "current" | "not-shared" | "approx"
  >("not-shared");
  const [response, setResponse] = useState<TriageResponse | null>(null);
  const [isDemo, setIsDemo] = useState(!process.env.NEXT_PUBLIC_TRIAGE_API_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<Language>("auto");
  const manualLocationChosen = useRef(false);
  const copy = getUiCopy(
    response?.ui_copy.response_language ??
      (language === "auto" ? "en" : language),
  );
  const backendCopy = response?.ui_copy;
  const areaLabels: Record<string, string> = {
    center: copy.areaCenter,
    vijayanagar: copy.areaVijayanagar,
    kuvempunagar: copy.areaKuvempunagar,
    nazarbad: copy.areaNazarbad,
    hebbal: copy.areaHebbal,
  };
  const exampleLabels = [
    copy.examplePoisoning,
    copy.exampleSnakeBite,
    copy.exampleChestPain,
    copy.exampleBreathing,
  ];
  const prealertCanCopy = Boolean(
    response?.recommendation?.verified &&
    response.recommendation.type !== "sample" &&
    !response.recommendation.id.startsWith("sample_"),
  );

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (manualLocationChosen.current) return;
        setResponse(null);
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "gps",
          label: "Current location · coordinates hidden",
        });
        setLocationStatus("current");
      },
      () => {
        if (!manualLocationChosen.current) setLocationStatus("not-shared");
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    document.documentElement.lang =
      response?.ui_copy.response_language ??
      (language === "auto" ? "en" : language);
  }, [language, response]);

  const hasRedFlag = Boolean(response?.emergency.red_flags.length);
  const demoModeConfigured = !process.env.NEXT_PUBLIC_TRIAGE_API_URL;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCopied(false);
    if (query.trim().length < 2) {
      setError(copy.shortInputError);
      return;
    }
    setLoading(true);
    try {
      const result = await requestTriage(query, location, language);
      setResponse(result.data);
      setIsDemo(result.demo);
    } catch {
      setError(copy.requestError);
    } finally {
      setLoading(false);
    }
  }

  function selectArea(areaId: string) {
    const area = areas.find((item) => item.id === areaId) ?? areas[0];
    manualLocationChosen.current = true;
    setResponse(null);
    setLocation({
      lat: area.lat,
      lng: area.lng,
      source: "manual",
      label: area.label,
    });
    setLocationStatus("approx");
  }

  async function copyPreAlert() {
    if (!response?.recommendation?.verified) return;
    try {
      await navigator.clipboard.writeText(response.pre_alert_text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(copy.clipboardError);
    }
  }

  const recommendation = response?.recommendation ?? null;
  const showDataNotice = isDemo || demoModeConfigured || Boolean(response);
  const hasSyntheticResults = Boolean(
    response &&
    [response.recommendation, ...response.alternatives].some(
      (item) => item?.type === "sample" || item?.id.startsWith("sample_"),
    ),
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" aria-label="SahayAI home">
            <div className="brand-mark">S</div>
            <div>
              <div className="brand-name">SahayAI</div>
              <div className="brand-caption">{copy.brandCaption}</div>
            </div>
          </div>
          <nav className="hotline-actions" aria-label={copy.hotlineNav}>
            <a className="hotline-link primary" href="tel:108">
              <Icon name="phone" />
              <span>{copy.call108}</span>
              <span className="hotline-number">{copy.ambulance}</span>
            </a>
            <a className="hotline-link" href="tel:112">
              <Icon name="phone" />
              <span>{copy.call112}</span>
              <span className="hotline-number">{copy.emergency}</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="main-wrap">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-copy-block">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> {copy.heroEyebrow}
            </div>
            <h1 id="hero-heading">
              {copy.heroFirst}
              <br />
              <span>{copy.heroSecond}</span>
            </h1>
            <p className="hero-copy">{copy.heroCopy}</p>
          </div>
          <HeroMedia />
          <div className="hero-tools">
            <label className="language-control">
              <span>{copy.languageLabel}</span>
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as Language);
                  setResponse(null);
                }}
                aria-label={copy.languageLabel}
              >
                <option value="auto">{copy.languageAuto}</option>
                <option value="en">{copy.languageEnglish}</option>
                <option value="hi">{copy.languageHindi}</option>
                <option value="kn">{copy.languageKannada}</option>
              </select>
            </label>
            <div className="prototype-badge">{copy.prototypeBadge}</div>
          </div>
        </section>

        {showDataNotice && (
          <div className="notice" role="status">
            <strong>
              {hasSyntheticResults || !response
                ? copy.demoMode
                : copy.publicDataLabel}
            </strong>{" "}
            {hasSyntheticResults || !response
              ? copy.syntheticNotice
              : copy.publicDataNotice}
          </div>
        )}

        {hasRedFlag && (
          <div className="emergency-banner" role="alert">
            <Icon name="alert" className="alert-icon" />
            <div>
              <strong>
                {backendCopy?.emergency_banner ?? copy.emergencyBannerFallback}
              </strong>
              <p>{copy.emergencyBannerSupport}</p>
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
                <h2 id="situation-heading">{copy.formTitle}</h2>
                <p>{copy.formPrompt}</p>
              </div>
              <span className="step-mark">01 / 02</span>
            </div>

            <form onSubmit={submit}>
              <label className="field-label" htmlFor="area-select">
                {copy.locationLabel}{" "}
                <span className="field-help">{copy.locationHelp}</span>
              </label>
              <div className="location-row">
                <div
                  className={
                    "location-status" +
                    (locationStatus === "not-shared"
                      ? " needs-confirmation"
                      : " confirmed")
                  }
                  aria-live="polite"
                >
                  <Icon name="pin" />
                  <span className="location-text">
                    {locationStatus === "current"
                      ? copy.locationCurrent
                      : locationStatus === "approx"
                        ? copy.locationStatusApprox
                        : copy.locationStatusNotShared}
                  </span>
                </div>
                <label className="sr-only" htmlFor="area-select">
                  {copy.chooseArea}
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
                  aria-label={copy.chooseArea}
                >
                  <option value="" disabled>
                    {copy.chooseArea}
                  </option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {areaLabels[area.id]}
                    </option>
                  ))}
                </select>
              </div>
              {location.source === "manual" && (
                <p className="location-note">{copy.approxLocation}</p>
              )}

              <label className="field-label" htmlFor="situation-input">
                {copy.describeEmergency}{" "}
                <span className="field-help">{copy.languageHint}</span>
              </label>
              <textarea
                id="situation-input"
                className="situation-input"
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 500))}
                maxLength={500}
                placeholder={copy.placeholder}
                aria-describedby="input-hint"
              />
              <div className="input-meta">
                <span id="input-hint">{copy.noAdvice}</span>
                <span>{query.length}/500</span>
              </div>

              <div className="examples">
                <p className="example-label">{copy.examplesTitle}</p>
                <div className="chip-row">
                  {examples.map((example, index) => (
                    <button
                      key={example.text}
                      className="example-chip"
                      type="button"
                      onClick={() => setQuery(example.text)}
                    >
                      {exampleLabels[index]}
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
                    {copy.submitting}
                  </>
                ) : (
                  <>
                    <Icon name="spark" /> {copy.submit}
                  </>
                )}
              </button>
              <p className="privacy-note">
                <Icon name="shield" /> {copy.privacy}
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
            aria-busy={loading}
          >
            <div className="results-header">
              <div className="results-title">
                <div className="result-icon">
                  <Icon name="spark" />
                </div>
                <div>
                  <h2 id="results-heading">{copy.resultsTitle}</h2>
                  <p>
                    {response
                      ? copy.resultsSubtitle
                      : copy.resultsEmptySubtitle}
                  </p>
                </div>
              </div>
              <span className="result-mode">
                {response
                  ? isDemo
                    ? copy.statusDemo
                    : copy.statusMatched
                  : copy.statusReady}
              </span>
            </div>

            {loading ? (
              <div className="loading-state">
                <div className="spinner" />
                <strong>{copy.loadingTitle}</strong>
                <p>{copy.loadingHelp}</p>
              </div>
            ) : !response ? (
              <div className="empty-state">
                <div className="empty-art">
                  <Icon name="route" />
                </div>
                <h3>{copy.emptyTitle}</h3>
                <p>{copy.emptyPrompt}</p>
              </div>
            ) : (
              <div className="results-content">
                {response.warnings.filter(Boolean).map((warning) => (
                  <div key={warning} className="match-warning">
                    {warning}
                  </div>
                ))}
                {recommendation ? (
                  <>
                    <div className="recommend-label">
                      <Icon name="check" /> {copy.recommendLabel}
                    </div>
                    <HospitalCard
                      match={recommendation}
                      copy={copy}
                      uiActionsUnavailable={backendCopy?.actions_unavailable}
                      primary
                      locationAvailable={locationStatus !== "not-shared"}
                    />
                    {response.alternatives.length > 0 && (
                      <>
                        <div className="backup-heading">
                          <span>{copy.backups}</span>
                          <span>{copy.callAhead}</span>
                        </div>
                        <div className="backup-list">
                          {response.alternatives.slice(0, 2).map((match) => (
                            <HospitalCard
                              key={match.id}
                              match={match}
                              copy={copy}
                              uiActionsUnavailable={
                                backendCopy?.actions_unavailable
                              }
                              locationAvailable={locationStatus !== "not-shared"}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    <p className="followup-note">{copy.followup}</p>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-art">
                      <Icon name="alert" />
                    </div>
                    <h3>{copy.noResultTitle}</h3>
                    <p>{copy.noResultHelp}</p>
                  </div>
                )}
                <details className="prealert-panel">
                  <summary>{copy.prealertPreview}</summary>
                  <pre>
                    {response.pre_alert_text || copy.prealertUnavailable}
                  </pre>
                  <button
                    className="prealert-copy-button"
                    type="button"
                    disabled={!prealertCanCopy}
                    onClick={copyPreAlert}
                  >
                    {copied ? copy.copiedPrealert : copy.copyPrealert}
                  </button>
                  {!prealertCanCopy && <p>{copy.prealertCopyUnavailable}</p>}
                </details>
                <div className="disclaimer">
                  {backendCopy?.disclaimer ??
                    (isDemo ? copy.demoDisclaimer : copy.liveDisclaimer)}{" "}
                  {backendCopy?.capabilities_note}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="footer">{copy.footer}</footer>
    </div>
  );
}

export function HospitalCard({
  match,
  copy,
  uiActionsUnavailable,
  primary = false,
  locationAvailable = false,
}: {
  match: HospitalMatch;
  copy: ReturnType<typeof getUiCopy>;
  uiActionsUnavailable?: string;
  primary?: boolean;
  locationAvailable?: boolean;
}) {
  const hospital = match;
  const synthetic =
    hospital.type === "sample" || hospital.id.startsWith("sample_");
  const callHref =
    hospital.verified && hospital.phone && match.call_url
      ? match.call_url
      : undefined;
  const canNavigate =
    locationAvailable &&
    Number.isFinite(hospital.lat) &&
    Number.isFinite(hospital.lng) &&
    Boolean(match.directions_url);
  return (
    <article className={"hospital-card" + (primary ? "" : " backup")}>
      <div className="hospital-topline">
        <div>
          <h3 className="hospital-name">
            {hospital.name || copy.hospitalNameUnavailable}
          </h3>
          <p className="hospital-address">
            {synthetic
              ? copy.syntheticAddress
              : hospital.address || copy.addressUnavailable}
          </p>
        </div>
        <span className="sample-badge">
          {synthetic
            ? copy.badgeSynthetic
            : hospital.verified
              ? copy.badgeVerified
              : copy.badgePublic}
        </span>
      </div>
      <div className="hospital-metrics">
        <span className="metric">
          <Icon name="pin" /> {copy.distance}: {match.distance_km.toFixed(1)} km
        </span>
        <span className="metric">
          <Icon name="clock" /> {copy.eta}: {match.eta_min_approx} min
        </span>
      </div>
      <div className="reason-list">
        {match.reasons.filter(Boolean).map((reason) => (
          <span key={reason} className="reason-pill">
            {reason}
          </span>
        ))}
      </div>
      <div className="provenance">
        <p className="verified-line">
          {hospital.verified ? copy.verifiedAt : copy.notVerified}:{" "}
          <strong>{hospital.last_verified || "—"}</strong>
        </p>
        {hospital.research_checked_on && (
          <p className="verified-line">
            {copy.researchedAt}: <strong>{hospital.research_checked_on}</strong>
          </p>
        )}
        <p className="verified-line">
          {hospital.location_verified
            ? copy.locationVerified
            : copy.locationNotVerified}
        </p>
        {hospital.source_urls.length > 0 ? (
          <p className="source-links">
            {hospital.source_urls.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {copy.sourceLink} {index + 1}
              </a>
            ))}
          </p>
        ) : synthetic ? (
          <p className="verified-line">{copy.syntheticSource}</p>
        ) : hospital.source ? (
          <p className="verified-line">{hospital.source}</p>
        ) : (
          <p className="verified-line">{copy.sourceUnavailable}</p>
        )}
      </div>
      <div className="action-row">
        {callHref ? (
          <a className="action-button" href={callHref}>
            <Icon name="phone" /> {copy.callHospital}
          </a>
        ) : (
          <span
            className="action-button disabled"
            aria-disabled="true"
            title={uiActionsUnavailable ?? copy.callUnavailable}
          >
            <Icon name="phone" /> {copy.callUnavailable}
          </span>
        )}
        {canNavigate ? (
          <a
            className="action-button"
            href={match.directions_url!}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="route" /> {copy.navigate}
          </a>
        ) : (
          <span
            className="action-button disabled"
            aria-disabled="true"
            title={uiActionsUnavailable ?? copy.navigateUnavailable}
          >
            <Icon name="route" /> {copy.navigateUnavailable}
          </span>
        )}
      </div>
    </article>
  );
}
