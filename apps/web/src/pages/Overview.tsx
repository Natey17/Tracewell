import { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { StatTile } from "../components/StatTile";
import { DailySyncChart } from "../components/DailySyncChart";
import { IncidentCard } from "../components/IncidentCard";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  return `${(mins / 60).toFixed(1)}h ago`;
}

export function Overview() {
  const stats = usePolling(api.getPipelineStats, 5000);
  const incidents = usePolling(() => api.listIncidents(), 5000);
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      await api.triggerScan();
    } finally {
      setScanning(false);
    }
  }

  const s = stats.data;
  const openIncidents = incidents.data?.incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "IGNORED") ?? [];

  return (
    <div>
      <div className="section-header">
        <div>
          <h1>Pipeline health</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Live status of the order-sync pipeline
          </p>
        </div>
        <button className="button secondary" onClick={handleScan} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>

      {stats.error && <div className="error-banner">Failed to load pipeline stats: {stats.error}</div>}

      {s && (
        <>
          <div className="stat-grid">
            <StatTile label="Total orders" value={s.totalOrders.toLocaleString()} />
            <StatTile
              label="Blocked backlog"
              value={s.backlogCount}
              tone={s.backlogCount >= 20 ? "critical" : s.backlogCount >= 5 ? "warning" : "good"}
              hint={s.backlogCount > 0 ? "orders discovered but not yet synced" : "nothing waiting"}
            />
            <StatTile
              label="Oldest stuck order"
              value={s.oldestStuckOrder ? `#${s.oldestStuckOrder.sequenceNumber}` : "—"}
              tone={s.oldestStuckOrder ? "warning" : "good"}
              hint={s.oldestStuckOrder ? `stuck since ${timeAgo(s.oldestStuckOrder.stuckSince)}` : "no stuck orders"}
            />
            <StatTile
              label="Sync failures (1h)"
              value={s.recentFailureCount}
              tone={s.recentFailureCount >= 10 ? "critical" : s.recentFailureCount > 0 ? "warning" : "good"}
            />
            <StatTile label="Last order discovered" value={timeAgo(s.lastDiscoveredAt)} />
            <StatTile
              label="Cursor position"
              value={s.cursor ? `#${s.cursor.lastProcessedSequenceNumber}` : "—"}
              hint={s.cursor?.name}
            />
          </div>

          <div className="card">
            <h2>Orders synced per day (last 14 days)</h2>
            <DailySyncChart data={s.dailySyncedCounts} />
          </div>
        </>
      )}

      <div className="section-header">
        <h2 style={{ margin: 0 }}>Open incidents</h2>
      </div>
      {openIncidents.length === 0 ? (
        <div className="empty-state card">No open incidents. The scanner is watching.</div>
      ) : (
        <div className="incident-list">
          {openIncidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  );
}
