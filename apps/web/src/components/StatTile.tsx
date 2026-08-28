export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warning" | "serious" | "critical";
}) {
  const toneColor = tone ? `var(--status-${tone})` : "var(--text-primary)";
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value" style={{ color: toneColor }}>
        {value}
      </div>
      {hint && <div className="stat-tile-hint">{hint}</div>}
    </div>
  );
}
