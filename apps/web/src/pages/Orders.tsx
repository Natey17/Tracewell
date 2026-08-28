import { Fragment, useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { OrderStatusBadge } from "../components/StatusBadge";
import type { SyncEvent } from "../api/types";

const STATUS_OPTIONS = ["ALL", "DISCOVERED", "SYNCING", "AWAITING_SETTLEMENT", "SETTLED", "SYNCED", "FAILED", "CANCELLED"];

export function Orders() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [events, setEvents] = useState<SyncEvent[] | null>(null);

  const { data, error } = usePolling(
    () => api.listOrders({ status: statusFilter === "ALL" ? undefined : statusFilter, limit: 100 }),
    6000,
    [statusFilter]
  );

  async function toggleExpand(orderId: number) {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    setExpanded(orderId);
    const order = await api.getOrder(orderId);
    setEvents(order.events ?? []);
  }

  return (
    <div>
      <h1>Orders</h1>
      <p className="page-subtitle">Most recent 100 orders by sequence number</p>

      <div className="filter-row">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">Failed to load orders: {error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Seq #</th>
              <th>External ID</th>
              <th>Status</th>
              <th>Currency</th>
              <th>Amount</th>
              <th>Discovered</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>
            {data?.orders.map((order) => (
              <Fragment key={order.id}>
                <tr onClick={() => toggleExpand(order.id)} style={{ cursor: "pointer" }}>
                  <td className="mono">#{order.sequenceNumber}</td>
                  <td className="mono">{order.externalId}</td>
                  <td>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td>{order.currency}</td>
                  <td>{(order.amountCents / 100).toFixed(2)}</td>
                  <td>{new Date(order.discoveredAt).toLocaleString()}</td>
                  <td>{order.attemptCount}</td>
                </tr>
                {expanded === order.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--page)" }}>
                      {events === null ? (
                        <span className="stat-tile-hint">Loading…</span>
                      ) : (
                        <ul className="evidence-list" style={{ padding: "8px 4px" }}>
                          {events.map((e) => (
                            <li className="evidence-item" key={e.id}>
                              <span className="mono stat-tile-hint" style={{ width: 150, flexShrink: 0 }}>
                                {new Date(e.createdAt).toLocaleString()}
                              </span>
                              <span>
                                <strong>{e.type}</strong> — {e.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 && <div className="empty-state">No orders match this filter.</div>}
      </div>
    </div>
  );
}
