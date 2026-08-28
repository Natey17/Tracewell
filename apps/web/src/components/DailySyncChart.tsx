interface Props {
  data: { date: string; count: number }[];
}

export function DailySyncChart({ data }: Props) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="bar-chart">
        {data.map((d) => {
          const heightPct = (d.count / max) * 100;
          return (
            <div className="bar-chart-col" key={d.date} title={`${d.date}: ${d.count} synced`}>
              <div
                className={`bar-chart-bar${d.count === 0 ? " zero" : ""}`}
                style={{ height: `${Math.max(heightPct, d.count === 0 ? 3 : 3)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span className="stat-tile-hint">{data[0]?.date}</span>
        <span className="stat-tile-hint">{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
