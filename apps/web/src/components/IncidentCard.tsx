import { Link } from "react-router-dom";
import type { Incident } from "../api/types";
import { SeverityBadge, IncidentStatusBadge } from "./StatusBadge";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const hasReport = incident.reports.length > 0;
  return (
    <Link to={`/incidents/${incident.id}`} className="incident-card">
      <div className="incident-card-top">
        <span className="incident-title">{incident.title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <SeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </div>
      <p className="incident-summary">{incident.summary}</p>
      <div className="incident-meta">
        <span>{incident.type.replace(/_/g, " ")}</span>
        <span>&middot;</span>
        <span>detected {timeAgo(incident.detectedAt)}</span>
        <span>&middot;</span>
        <span>{hasReport ? "report ready" : "investigation pending"}</span>
      </div>
    </Link>
  );
}
