const SEVERITY_COLOR: Record<string, string> = {
  LOW: "var(--status-good)",
  MEDIUM: "var(--status-warning)",
  HIGH: "var(--status-serious)",
  CRITICAL: "var(--status-critical)",
};

const INCIDENT_STATUS_COLOR: Record<string, string> = {
  OPEN: "var(--status-warning)",
  INVESTIGATING: "var(--series-1)",
  RESOLVED: "var(--status-good)",
  IGNORED: "var(--muted)",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  DISCOVERED: "var(--muted)",
  SYNCING: "var(--series-1)",
  AWAITING_SETTLEMENT: "var(--status-warning)",
  SETTLED: "var(--series-1)",
  SYNCED: "var(--status-good)",
  FAILED: "var(--status-critical)",
  CANCELLED: "var(--muted)",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <span className="badge-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge label={severity} color={SEVERITY_COLOR[severity] ?? "var(--muted)"} />;
}

export function IncidentStatusBadge({ status }: { status: string }) {
  return <Badge label={status} color={INCIDENT_STATUS_COLOR[status] ?? "var(--muted)"} />;
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge label={status.replace(/_/g, " ")} color={ORDER_STATUS_COLOR[status] ?? "var(--muted)"} />;
}
