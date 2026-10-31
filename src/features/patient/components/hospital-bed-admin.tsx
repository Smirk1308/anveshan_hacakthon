"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminHospitalSummary,
  fetchAdminHospitals,
  updateHospitalBeds,
} from "../lib/admin-beds-client";
import { DepartmentBedCount } from "../lib/contracts";

export default function HospitalBedAdmin() {
  const [hospitals, setHospitals] = useState<AdminHospitalSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("hosp_002");
  const [beds, setBeds] = useState<DepartmentBedCount[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [staffName, setStaffName] = useState("Staff on duty");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await fetchAdminHospitals();
        setHospitals(data);
        const initial = data.find((h) => h.id === "hosp_002") || data[0];
        if (initial) {
          setSelectedId(initial.id);
          setBeds(JSON.parse(JSON.stringify(initial.department_beds)));
        }
      } catch (err) {
        setMessage({
          type: "error",
          text:
            err instanceof Error ? err.message : "Failed to load hospital data",
        });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selectedHospital = hospitals.find((h) => h.id === selectedId);

  const handleSelectHospital = (id: string) => {
    setSelectedId(id);
    const target = hospitals.find((h) => h.id === id);
    if (target) {
      setBeds(JSON.parse(JSON.stringify(target.department_beds)));
    }
    setMessage(null);
  };

  const handleBedChange = (deptId: string, newAvailable: number) => {
    setBeds((prev) =>
      prev.map((b) => {
        if (b.department_id === deptId) {
          const clamped = Math.max(0, Math.min(b.total, newAvailable));
          return { ...b, available: clamped };
        }
        return b;
      }),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    try {
      setSaving(true);
      setMessage(null);
      const res = await updateHospitalBeds(selectedId, beds, staffName);
      // Update local hospital list
      setHospitals((prev) =>
        prev.map((h) =>
          h.id === selectedId
            ? {
                ...h,
                available_beds: res.available_beds,
                total_beds: res.total_beds,
                department_beds: res.department_beds,
              }
            : h,
        ),
      );
      setMessage({
        type: "success",
        text: `✓ Live bed status for ${selectedHospital?.name} updated successfully across the network!`,
      });
      window.setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to update bed counts",
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredHospitals = hospitals.filter(
    (h) =>
      h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.address.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalBeds = beds.reduce((sum, b) => sum + b.total, 0);
  const totalAvailable = beds.reduce((sum, b) => sum + b.available, 0);
  const totalOccupied = totalBeds - totalAvailable;
  const occupancyRate =
    totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

  return (
    <div className="admin-shell">
      {/* Top Header */}
      <header className="admin-header">
        <div className="admin-header-content">
          <div className="admin-brand">
            <span className="admin-logo" aria-hidden="true">
              S
            </span>
            <div>
              <h1 className="admin-title">Sanjeevani</h1>
              <p className="admin-subtitle">HOSPITAL STAFF LIVE BED PORTAL</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <Link href="/" className="back-link">
              ← Back to Patient Finder
            </Link>
          </div>
        </div>
      </header>

      <main className="admin-container">
        {/* Banner Notice */}
        <div className="admin-intro-card">
          <div>
            <h2>Live Department Bed Management</h2>
            <p>
              Hospital emergency desks, casualty triage, and ward staff can
              update real-time bed availability below. Saved updates immediately
              sync with the Sanjeevani emergency routing engine.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`admin-alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
            role="status"
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="admin-loading">Loading hospital records…</div>
        ) : (
          <div className="admin-layout-grid">
            {/* Hospital Selection Column */}
            <aside className="hospital-picker-panel">
              <div className="picker-header">
                <h3>Select Hospital ({hospitals.length})</h3>
                <input
                  type="text"
                  placeholder="Search hospital..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                  aria-label="Search hospital by name"
                />
              </div>

              <div className="hospital-list">
                {filteredHospitals.map((h) => {
                  const isSelected = h.id === selectedId;
                  const isCritical = h.available_beds <= 5;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => handleSelectHospital(h.id)}
                      className={`hospital-item-btn ${isSelected ? "active" : ""}`}
                    >
                      <div className="item-name-row">
                        <span className="item-name">{h.name}</span>
                        <span className={`item-badge ${h.type}`}>{h.type}</span>
                      </div>
                      <div className="item-meta-row">
                        <span>
                          {h.available_beds} / {h.total_beds} beds free
                        </span>
                        {isCritical && (
                          <span className="low-beds-pill">Low Capacity</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main Bed Editor Form */}
            <section className="bed-editor-panel">
              {selectedHospital && (
                <>
                  <div className="selected-overview">
                    <div className="overview-header">
                      <div>
                        <h2>{selectedHospital.name}</h2>
                        <p className="overview-sub">
                          {selectedHospital.address || "Mysuru, Karnataka"} •
                          Ph:{" "}
                          <strong>
                            {selectedHospital.phone || "Not listed"}
                          </strong>
                        </p>
                      </div>
                      <div className="overview-stats-row">
                        <div className="stat-pill">
                          <span className="stat-val">{totalAvailable}</span>
                          <span className="stat-label">Beds Free</span>
                        </div>
                        <div className="stat-pill">
                          <span className="stat-val">{totalOccupied}</span>
                          <span className="stat-label">Occupied</span>
                        </div>
                        <div className="stat-pill">
                          <span className="stat-val">{totalBeds}</span>
                          <span className="stat-label">Total Beds</span>
                        </div>
                        <div className="stat-pill">
                          <span className="stat-val">{occupancyRate}%</span>
                          <span className="stat-label">Occupancy</span>
                        </div>
                      </div>
                    </div>

                    <div className="occupancy-bar-container">
                      <div
                        className="occupancy-bar-fill"
                        style={{
                          width: `${Math.min(100, occupancyRate)}%`,
                          backgroundColor:
                            occupancyRate > 90
                              ? "#b91c1c"
                              : occupancyRate > 75
                                ? "#d97706"
                                : "#0f766e",
                        }}
                      />
                    </div>
                  </div>

                  <form onSubmit={handleSave} className="departments-form">
                    <div className="departments-grid">
                      {beds.map((d) => {
                        const deptOccupancy =
                          d.total > 0
                            ? Math.round(
                                ((d.total - d.available) / d.total) * 100,
                              )
                            : 0;
                        const isFull = d.available === 0;
                        const isLow = d.available > 0 && d.available <= 3;

                        return (
                          <div key={d.department_id} className="dept-card">
                            <div className="dept-card-header">
                              <div>
                                <h4 className="dept-name">
                                  {d.department_name}
                                </h4>
                                <span className="dept-id-code">
                                  ID: {d.department_id}
                                </span>
                              </div>
                              <span
                                className={`dept-status-badge ${
                                  isFull
                                    ? "status-full"
                                    : isLow
                                      ? "status-low"
                                      : "status-ok"
                                }`}
                              >
                                {isFull
                                  ? "FULL"
                                  : isLow
                                    ? "CRITICAL LOW"
                                    : "AVAILABLE"}
                              </span>
                            </div>

                            <div className="dept-meter">
                              <div className="meter-label-row">
                                <span>Occupancy: {deptOccupancy}%</span>
                                <span>
                                  <strong>{d.available}</strong> of {d.total}{" "}
                                  free
                                </span>
                              </div>
                              <div className="meter-track">
                                <div
                                  className="meter-fill"
                                  style={{
                                    width: `${deptOccupancy}%`,
                                    backgroundColor: isFull
                                      ? "#b91c1c"
                                      : isLow
                                        ? "#d97706"
                                        : "#0f766e",
                                  }}
                                />
                              </div>
                            </div>

                            <div className="counter-controls">
                              <div className="stepper-row">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBedChange(
                                      d.department_id,
                                      d.available - 1,
                                    )
                                  }
                                  disabled={d.available <= 0}
                                  className="stepper-btn minus"
                                  title="Admit 1 patient (decrease available)"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max={d.total}
                                  value={d.available}
                                  onChange={(e) =>
                                    handleBedChange(
                                      d.department_id,
                                      parseInt(e.target.value, 10) || 0,
                                    )
                                  }
                                  className="stepper-input"
                                  aria-label={`Available beds in ${d.department_name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBedChange(
                                      d.department_id,
                                      d.available + 1,
                                    )
                                  }
                                  disabled={d.available >= d.total}
                                  className="stepper-btn plus"
                                  title="Discharge 1 patient (increase available)"
                                >
                                  +
                                </button>
                              </div>

                              <div className="quick-actions">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBedChange(
                                      d.department_id,
                                      d.available - 1,
                                    )
                                  }
                                  disabled={d.available <= 0}
                                  className="quick-btn admit"
                                >
                                  −1 Admit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBedChange(
                                      d.department_id,
                                      d.available + 1,
                                    )
                                  }
                                  disabled={d.available >= d.total}
                                  className="quick-btn discharge"
                                >
                                  +1 Discharge
                                </button>
                              </div>
                            </div>

                            {d.last_updated && (
                              <div className="dept-footer">
                                Last updated:{" "}
                                {new Date(d.last_updated).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="form-submit-bar">
                      <div className="staff-input-group">
                        <label htmlFor="staff-name">Staff on duty:</label>
                        <input
                          id="staff-name"
                          type="text"
                          value={staffName}
                          onChange={(e) => setStaffName(e.target.value)}
                          placeholder="e.g. Dr. Kumar / Casualty Officer"
                          className="staff-input"
                        />
                      </div>

                      <div className="action-buttons-group">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedHospital) {
                              setBeds(
                                JSON.parse(
                                  JSON.stringify(
                                    selectedHospital.department_beds,
                                  ),
                                ),
                              );
                            }
                          }}
                          className="reset-btn"
                          disabled={saving}
                        >
                          Discard Changes
                        </button>

                        <button
                          type="submit"
                          disabled={saving}
                          className="save-beds-btn"
                        >
                          {saving
                            ? "Saving Live Data…"
                            : "Save Live Availability"}
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
