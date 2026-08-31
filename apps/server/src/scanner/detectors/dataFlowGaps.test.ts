import { describe, it, expect, beforeEach } from "vitest";
import { IncidentType, Severity } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter } from "../../../test/helpers";
import { detectDataFlowGaps } from "./dataFlowGaps";

const THRESHOLD_MINUTES = 120;

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

describe("detectDataFlowGaps", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns nothing when there are no orders at all", async () => {
    expect(await detectDataFlowGaps(THRESHOLD_MINUTES)).toEqual([]);
  });

  it("stays quiet when the most recent order is within the threshold", async () => {
    await createOrder({ discoveredAt: minutesAgo(THRESHOLD_MINUTES - 10) });
    expect(await detectDataFlowGaps(THRESHOLD_MINUTES)).toEqual([]);
  });

  it("flags a gap once the newest order exceeds the threshold", async () => {
    const stale = await createOrder({ discoveredAt: minutesAgo(THRESHOLD_MINUTES + 30) });

    const anomalies = await detectDataFlowGaps(THRESHOLD_MINUTES);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe(IncidentType.DATA_FLOW_GAP);
    expect(anomalies[0].relatedOrderIds).toEqual([stale.id]);
  });

  it("keys off the single most recently discovered order, not the oldest", async () => {
    await createOrder({ discoveredAt: minutesAgo(60 * 24 * 5) });
    const recent = await createOrder({ discoveredAt: minutesAgo(10) });

    expect(await detectDataFlowGaps(THRESHOLD_MINUTES)).toEqual([]);
    void recent;
  });

  it("escalates to CRITICAL beyond 12 hours", async () => {
    await createOrder({ discoveredAt: minutesAgo(60 * 13) });

    const anomalies = await detectDataFlowGaps(THRESHOLD_MINUTES);

    expect(anomalies[0].severity).toBe(Severity.CRITICAL);
  });
});
