import { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { IncidentCard } from "../components/IncidentCard";

const STATUS_OPTIONS = ["ALL", "OPEN", "INVESTIGATING", "RESOLVED", "IGNORED"];

export function Incidents() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const { data, error } = usePolling(
    () => api.listIncidents(statusFilter === "ALL" ? undefined : statusFilter),
    5000,
    [statusFilter]
  );

  return (
    <div>
      <h1>Incidents</h1>
      <p className="page-subtitle">Anomalies flagged by the scanner, with agent-generated root-cause reports</p>

      <div className="filter-row">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">Failed to load incidents: {error}</div>}

      {data && data.incidents.length === 0 && <div className="empty-state card">No incidents match this filter.</div>}

      <div className="incident-list">
        {data?.incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
    </div>
  );
}
