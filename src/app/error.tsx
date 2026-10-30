"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Sanjeevani application error:", error);
  }, [error]);

  return (
    <div
      className="app-shell"
      style={{ minHeight: "100vh", padding: "2rem 1rem" }}
    >
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" aria-label="Sanjeevani home">
            <div className="brand-mark">S</div>
            <div>
              <div className="brand-name">Sanjeevani</div>
              <div className="brand-caption">Emergency hospital finder</div>
            </div>
          </div>
          <nav className="hotline-actions" aria-label="Emergency numbers">
            <a className="hotline-link primary" href="tel:108">
              <span>Call 108</span>
              <span className="hotline-number">Ambulance</span>
            </a>
            <a className="hotline-link" href="tel:112">
              <span>Call 112</span>
              <span className="hotline-number">Emergency</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="main-wrap" style={{ marginTop: "2rem" }}>
        <div className="emergency-banner" role="alert">
          <div>
            <strong>
              If this is a life-threatening emergency, call 108 or 112
              immediately.
            </strong>
            <p>Do not wait for this application to load or respond.</p>
          </div>
        </div>

        <section
          className="panel"
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            padding: "2.5rem 1.5rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              marginBottom: "0.75rem",
              color: "#06201e",
            }}
          >
            Something went wrong while displaying this page
          </h2>
          <p
            style={{ color: "#526b70", maxWidth: 480, margin: "0 auto 1.5rem" }}
          >
            The application encountered an unexpected issue. You can try
            refreshing the view, or call 108 / 112 directly.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="submit-button"
              style={{ width: "auto", minWidth: 160 }}
              onClick={() => reset()}
            >
              Try again
            </button>
            <Link
              href="/"
              className="action-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Reload app
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer" style={{ marginTop: "3rem" }}>
        Sanjeevani assists your decision; it does not replace 108, paramedics,
        or doctors.
      </footer>
    </div>
  );
}
