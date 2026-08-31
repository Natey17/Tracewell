import { describe, it, expect, beforeEach } from "vitest";
import { OrderStatus, IncidentType, Severity } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter } from "../../../test/helpers";
import { detectStuckOrders } from "./stuckOrders";

const THRESHOLD_MINUTES = 60;

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

describe("detectStuckOrders", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns nothing when there are no non-terminal orders", async () => {
    await createOrder({ status: OrderStatus.SYNCED });
    expect(await detectStuckOrders(THRESHOLD_MINUTES)).toEqual([]);
  });

  it("does not flag a recently-attempted order still within the threshold", async () => {
    await createOrder({
      status: OrderStatus.AWAITING_SETTLEMENT,
      lastAttemptAt: minutesAgo(THRESHOLD_MINUTES - 5),
    });
    expect(await detectStuckOrders(THRESHOLD_MINUTES)).toEqual([]);
  });

  it("flags an order stuck past the threshold, with MEDIUM severity", async () => {
    const order = await createOrder({
      status: OrderStatus.AWAITING_SETTLEMENT,
      lastAttemptAt: minutesAgo(THRESHOLD_MINUTES + 5),
    });

    const anomalies = await detectStuckOrders(THRESHOLD_MINUTES);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      type: IncidentType.STUCK_ORDER,
      severity: Severity.MEDIUM,
      relatedOrderIds: [order.id],
      dedupeKey: `STUCK_ORDER:${order.id}`,
    });
  });

  it("escalates severity to HIGH beyond 12 hours and CRITICAL beyond 2 days", async () => {
    const twelveHoursStuck = await createOrder({
      status: OrderStatus.SYNCING,
      lastAttemptAt: minutesAgo(60 * 13),
    });
    const twoDaysStuck = await createOrder({
      status: OrderStatus.AWAITING_SETTLEMENT,
      lastAttemptAt: minutesAgo(60 * 24 * 2 + 30),
    });

    const anomalies = await detectStuckOrders(THRESHOLD_MINUTES);
    const bySeverity = Object.fromEntries(anomalies.map((a) => [a.relatedOrderIds[0], a.severity]));

    expect(bySeverity[twelveHoursStuck.id]).toBe(Severity.HIGH);
    expect(bySeverity[twoDaysStuck.id]).toBe(Severity.CRITICAL);
  });

  it("falls back to discoveredAt when an order has never been attempted", async () => {
    const order = await createOrder({
      status: OrderStatus.AWAITING_SETTLEMENT,
      lastAttemptAt: null,
      discoveredAt: minutesAgo(THRESHOLD_MINUTES + 5),
    });

    const anomalies = await detectStuckOrders(THRESHOLD_MINUTES);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].relatedOrderIds).toEqual([order.id]);
  });

  it("ignores terminal-status orders even if old", async () => {
    await createOrder({ status: OrderStatus.SYNCED, lastAttemptAt: minutesAgo(60 * 24 * 30) });
    await createOrder({ status: OrderStatus.FAILED, lastAttemptAt: minutesAgo(60 * 24 * 30) });
    await createOrder({ status: OrderStatus.CANCELLED, lastAttemptAt: minutesAgo(60 * 24 * 30) });

    expect(await detectStuckOrders(THRESHOLD_MINUTES)).toEqual([]);
  });
});
