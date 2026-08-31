import { describe, it, expect, beforeEach } from "vitest";
import { IncidentType, Severity } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../../test/helpers";
import { detectSyncFailureSpike } from "./syncFailureSpike";

async function addFailures(orderId: number, count: number, minutesAgo = 5) {
  for (let i = 0; i < count; i++) {
    await testPrisma.syncEvent.create({
      data: {
        orderId,
        type: "SYNC_FAILURE",
        message: "boom",
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });
  }
}

describe("detectSyncFailureSpike", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("stays quiet below the 5-failure threshold", async () => {
    const order = await createOrder();
    await addFailures(order.id, 4);

    expect(await detectSyncFailureSpike()).toEqual([]);
  });

  it("ignores failures outside the 60 minute window", async () => {
    const order = await createOrder();
    await addFailures(order.id, 10, 90);

    expect(await detectSyncFailureSpike()).toEqual([]);
  });

  it("flags a spike at or above the threshold within the window", async () => {
    const orderA = await createOrder();
    const orderB = await createOrder();
    await addFailures(orderA.id, 3);
    await addFailures(orderB.id, 3);

    const anomalies = await detectSyncFailureSpike();

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe(IncidentType.SYNC_FAILURE_SPIKE);
    expect(anomalies[0].relatedOrderIds.sort()).toEqual([orderA.id, orderB.id].sort());
  });

  it("escalates to CRITICAL at 25+ failures", async () => {
    const order = await createOrder();
    await addFailures(order.id, 26);

    const anomalies = await detectSyncFailureSpike();

    expect(anomalies[0].severity).toBe(Severity.CRITICAL);
  });
});
