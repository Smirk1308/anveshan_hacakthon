"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_TRIAGE_API_URL?.replace(/\/$/, "") ?? "";

type Contact = {
  number: string;
  source_id: string;
  number_type: string;
  verification?: string;
};
type Provider = {
  provider_id: string;
  name: string;
  record_status: string;
  public_contacts: Contact[];
  address_or_service_location?: string;
  public_listing_notes?: string;
  evidence_label?: string;
  source_ids?: string[];
};
type Network = {
  network_id: string;
  name: string;
  public_contacts: Contact[];
  operating_model_note?: string;
  source_ids?: string[];
};
type Source = { source_id: string; title: string; url: string };
type Directory = {
  generated_on?: string;
  geography?: string;
  summary?: {
    local_provider_candidates?: number;
    network_or_aggregator_leads?: number;
    complete_or_exhaustive?: boolean;
  };
  providers: Provider[];
  networks_or_aggregators: Network[];
  sources: Source[];
};

const TEXT = {
  en: {
    title: "Private ambulance options",
    intro:
      "Publicly listed contacts for private providers and booking networks. Call to ask about availability, vehicle type, ETA, coverage and cost.",
    caveat:
      "This directory is incomplete and contacts have not been call-tested. It does not show live availability or guarantee a vehicle. Historical numbers are excluded. For life-threatening emergencies, call 108 or 112 first.",
    loading: "Loading public directory…",
    unavailable:
      "Private ambulance directory could not be loaded. Call 108 or 112 for urgent help.",
    providers: "Local provider listings",
    networks: "Booking networks",
    call: "Call listed contact",
    map: "View listed area",
    noPhone: "No current public contact number listed",
    notTested: "Public listing; not call-tested",
    route:
      "Directory call-routing number; may not connect directly to the operator",
    fleet: "Fleet operation or affiliation not established",
    possible: "Possible name/contact match; identity not confirmed",
    ask: "Ask about transfer to your chosen hospital. No fare or availability data is provided.",
    source: "Source",
  },
  hi: {
    title: "निजी एम्बुलेंस विकल्प",
    intro:
      "निजी सेवा प्रदाताओं और बुकिंग नेटवर्क के सार्वजनिक संपर्क। उपलब्धता, वाहन, ETA, क्षेत्र और कीमत पूछने के लिए कॉल करें।",
    caveat:
      "यह निर्देशिका अधूरी है और नंबरों पर कॉल करके जाँच नहीं की गई है। लाइव उपलब्धता या वाहन की गारंटी नहीं है। पुराने नंबर शामिल नहीं हैं। जानलेवा आपात स्थिति में पहले 108 या 112 पर कॉल करें।",
    loading: "सार्वजनिक सूची लोड हो रही है…",
    unavailable:
      "निजी एम्बुलेंस सूची उपलब्ध नहीं है। तुरंत सहायता के लिए 108 या 112 पर कॉल करें।",
    providers: "स्थानीय सेवा सूची",
    networks: "बुकिंग नेटवर्क",
    call: "दिए गए नंबर पर कॉल करें",
    map: "सूचीबद्ध क्षेत्र देखें",
    noPhone: "वर्तमान सार्वजनिक नंबर उपलब्ध नहीं",
    notTested: "सार्वजनिक सूची; कॉल करके जाँचा नहीं गया",
    route: "डायरेक्टरी कॉल-रूटिंग नंबर; सीधे सेवा प्रदाता से न जुड़े",
    fleet: "बेड़ा या संबद्धता स्थापित नहीं",
    possible: "संभावित नाम/संपर्क; पहचान की पुष्टि नहीं",
    ask: "अपने चुने अस्पताल तक ट्रांसफर के बारे में पूछें। किराया या उपलब्धता की जानकारी नहीं है।",
    source: "स्रोत",
  },
  kn: {
    title: "ಖಾಸಗಿ ಆಂಬ್ಯುಲೆನ್ಸ್ ಆಯ್ಕೆಗಳು",
    intro:
      "ಖಾಸಗಿ ಸೇವೆಗಳು ಮತ್ತು ಬುಕಿಂಗ್ ನೆಟ್‌ವರ್ಕ್‌ಗಳ ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕಗಳು. ಲಭ್ಯತೆ, ವಾಹನ, ETA, ವ್ಯಾಪ್ತಿ ಮತ್ತು ವೆಚ್ಚ ಕೇಳಲು ಕರೆಮಾಡಿ.",
    caveat:
      "ಈ ಪಟ್ಟಿ ಅಪೂರ್ಣ; ಸಂಖ್ಯೆಗಳನ್ನೆಲ್ಲ ಕರೆಮಾಡಿ ಪರೀಕ್ಷಿಸಿಲ್ಲ. ನೇರ ಲಭ್ಯತೆ ಅಥವಾ ವಾಹನದ ಖಾತರಿ ಇಲ್ಲ. ಹಳೆಯ ಸಂಖ್ಯೆಗಳನ್ನು ಕೈಬಿಟ್ಟಿದ್ದೇವೆ. ಜೀವಾಪಾಯದ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಲ್ಲಿ ಮೊದಲು 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    loading: "ಸಾರ್ವಜನಿಕ ಪಟ್ಟಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
    unavailable:
      "ಖಾಸಗಿ ಆಂಬ್ಯುಲೆನ್ಸ್ ಪಟ್ಟಿ ಲಭ್ಯವಿಲ್ಲ. ತುರ್ತು ಸಹಾಯಕ್ಕೆ 108 ಅಥವಾ 112 ಕರೆಮಾಡಿ.",
    providers: "ಸ್ಥಳೀಯ ಸೇವಾ ಪಟ್ಟಿಗಳು",
    networks: "ಬುಕಿಂಗ್ ನೆಟ್‌ವರ್ಕ್‌ಗಳು",
    call: "ಪಟ್ಟಿಯಲ್ಲಿರುವ ಸಂಪರ್ಕಕ್ಕೆ ಕರೆಮಾಡಿ",
    map: "ಪಟ್ಟಿಯ ಪ್ರದೇಶ ನೋಡಿ",
    noPhone: "ಪ್ರಸ್ತುತ ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕ ಸಂಖ್ಯೆ ಇಲ್ಲ",
    notTested: "ಸಾರ್ವಜನಿಕ ಪಟ್ಟಿ; ಕರೆಮಾಡಿ ಪರೀಕ್ಷಿಸಿಲ್ಲ",
    route:
      "ಡೈರೆಕ್ಟರಿ ಕರೆ-ರೂಟಿಂಗ್ ಸಂಖ್ಯೆ; ನೇರ ಸೇವಾ ಪೂರೈಕೆದಾರರಿಗೆ ಸಂಪರ್ಕಿಸದಿರಬಹುದು",
    fleet: "ವಾಹನ ಬಳಗ ಅಥವಾ ಸಂಬಂಧ ದೃಢಪಟ್ಟಿಲ್ಲ",
    possible: "ಸಂಭಾವ್ಯ ಹೆಸರು/ಸಂಪರ್ಕ; ಗುರುತು ದೃಢಪಟ್ಟಿಲ್ಲ",
    ask: "ನೀವು ಆಯ್ಕೆಮಾಡಿದ ಆಸ್ಪತ್ರೆಗೆ ವರ್ಗಾವಣೆಯ ಕುರಿತು ಕೇಳಿ. ದರ ಅಥವಾ ಲಭ್ಯತೆಯ ಮಾಹಿತಿ ಇಲ್ಲ.",
    source: "ಮೂಲ",
  },
} as const;
type DirectoryCopy = { [Key in keyof (typeof TEXT)["en"]]: string };

function dial(number: string) {
  return `tel:${number.replace(/[^+\d]/g, "")}`;
}

function contactDescription(contact: Contact, copy: DirectoryCopy) {
  if (
    contact.number_type === "directory_call_routing_number" ||
    contact.verification === "not_direct_operator_line"
  )
    return copy.route;
  if (contact.verification === "identity_match_unconfirmed")
    return copy.possible;
  return copy.notTested;
}

function Sources({
  ids,
  sources,
  copy,
}: {
  ids?: string[];
  sources: Map<string, Source>;
  copy: DirectoryCopy;
}) {
  return (
    <div className="source-links">
      {(ids ?? []).map((id) => {
        const source = sources.get(id);
        return source ? (
          <a key={id} href={source.url} target="_blank" rel="noreferrer">
            {copy.source}: {source.title}
          </a>
        ) : null;
      })}
    </div>
  );
}

function ContactLinks({
  contacts,
  sources,
  copy,
}: {
  contacts: Contact[];
  sources: Map<string, Source>;
  copy: DirectoryCopy;
}) {
  const current = contacts.filter(
    (contact) =>
      contact.verification !== "historical_unverified" &&
      !contact.number_type.startsWith("historical_"),
  );
  if (!current.length) return <p className="verified-line">{copy.noPhone}</p>;
  return (
    <div className="reason-list">
      {current.map((contact, index) => (
        <span
          key={`${contact.number}-${index}`}
          style={{
            display: "grid",
            gap: 4,
            border: "1px solid #d8eae2",
            borderRadius: 10,
            padding: 8,
            background: "#fff",
          }}
        >
          <a href={dial(contact.number)}>
            {copy.call}: {contact.number}
          </a>
          <small className="verified-line">
            {contactDescription(contact, copy)}
          </small>
          <Sources ids={[contact.source_id]} sources={sources} copy={copy} />
        </span>
      ))}
    </div>
  );
}

export default function PrivateAmbulanceDirectory({
  language,
}: {
  language: "auto" | "en" | "hi" | "kn";
}) {
  const copy = TEXT[language === "hi" || language === "kn" ? language : "en"];
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [error, setError] = useState(!API);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!API) return;
    let active = true;
    fetch(`${API}/api/ambulances`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("directory unavailable");
        return response.json() as Promise<Directory>;
      })
      .then((data) => {
        if (active) setDirectory(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const sources = useMemo(
    () =>
      new Map<string, Source>(
        (directory?.sources ?? []).map((source): [string, Source] => [
          source.source_id,
          source,
        ]),
      ),
    [directory],
  );
  const providers = useMemo(
    () =>
      (directory?.providers ?? []).filter((provider) => {
        const text =
          `${provider.name} ${provider.address_or_service_location ?? ""}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      }),
    [directory, query],
  );

  if (error)
    return (
      <section className="notice" aria-label={copy.title}>
        <strong>{copy.title}</strong>
        <p>{copy.unavailable}</p>
      </section>
    );
  return (
    <section
      className="panel"
      aria-labelledby="private-ambulance-title"
      style={{ marginTop: 18, padding: "20px 22px" }}
    >
      <div className="panel-heading" style={{ marginBottom: 10 }}>
        <div>
          <h2 id="private-ambulance-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <span className="step-mark">
          {directory?.summary?.local_provider_candidates ?? "—"}
        </span>
      </div>
      <p className="match-warning">{copy.caveat}</p>
      {!directory ? (
        <p className="verified-line" aria-live="polite">
          {copy.loading}
        </p>
      ) : (
        <>
          {directory.generated_on && (
            <p className="verified-line">
              Public directory updated {directory.generated_on} ·{" "}
              {directory.geography}
            </p>
          )}
          <details className="prealert-panel">
            <summary>
              {copy.providers} ({providers.length})
            </summary>
            <label className="field-label" htmlFor="private-ambulance-search">
              {copy.providers}
            </label>
            <input
              id="private-ambulance-search"
              className="location-select"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search provider or area"
            />
            <div className="backup-list" style={{ marginTop: 12 }}>
              {providers.map((provider) => (
                <article
                  className="hospital-card backup"
                  key={provider.provider_id}
                >
                  <div className="hospital-topline">
                    <h3 className="hospital-name">{provider.name}</h3>
                    <span className="sample-badge">Public lead</span>
                  </div>
                  <p className="hospital-address">
                    {provider.address_or_service_location ||
                      "Location not listed"}
                  </p>
                  <p className="verified-line">
                    {provider.evidence_label || provider.record_status}
                  </p>
                  {provider.public_listing_notes && (
                    <p className="verified-line">
                      {provider.public_listing_notes}
                    </p>
                  )}
                  {(provider.record_status.includes("vendor_lead") ||
                    provider.record_status.includes("regional_service") ||
                    provider.record_status.includes(
                      "identity_unconfirmed",
                    )) && (
                    <p className="match-warning">
                      {provider.record_status.includes("vendor_lead")
                        ? copy.fleet
                        : provider.record_status.includes(
                              "identity_unconfirmed",
                            )
                          ? copy.possible
                          : "Regional service coverage is not confirmed."}
                    </p>
                  )}
                  <ContactLinks
                    contacts={provider.public_contacts}
                    sources={sources}
                    copy={copy}
                  />
                  {provider.address_or_service_location && (
                    <a
                      className="action-button"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.address_or_service_location)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.map}
                    </a>
                  )}
                  <p className="verified-line">{copy.ask}</p>
                  <Sources
                    ids={provider.source_ids}
                    sources={sources}
                    copy={copy}
                  />
                </article>
              ))}
            </div>
            <details className="prealert-panel" style={{ marginTop: 14 }}>
              <summary>{copy.networks}</summary>
              <div className="backup-list" style={{ marginTop: 12 }}>
                {directory.networks_or_aggregators.map((network) => (
                  <article
                    className="hospital-card backup"
                    key={network.network_id}
                  >
                    <h3 className="hospital-name">{network.name}</h3>
                    <p className="verified-line">
                      {network.operating_model_note}
                    </p>
                    <ContactLinks
                      contacts={network.public_contacts}
                      sources={sources}
                      copy={copy}
                    />
                    <p className="verified-line">{copy.ask}</p>
                    <Sources
                      ids={network.source_ids}
                      sources={sources}
                      copy={copy}
                    />
                  </article>
                ))}
              </div>
            </details>
          </details>
        </>
      )}
    </section>
  );
}
