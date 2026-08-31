import { describe, it, expect, beforeEach } from "vitest";
import { OrderStatus, IncidentType, Severity } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../../test/helpers";
import { detectBlockedBacklog } from "./blockedBacklog";

describe("detectBlockedBacklog", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns nothing when there is no cursor yet", async () => {
    expect(await detectBlockedBacklog()).toEqual([]);
  });

  it("returns nothing when everything past the cursor is already synced", async () => {
    for (let i = 0; i < 10; i++) await createOrder({ status: OrderStatus.SYNCED });
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 10 } });

    expect(await detectBlockedBacklog()).toEqual([]);
  });

  it("stays quiet below the 5-order alert threshold", async () => {
    for (let i = 0; i < 5; i++) await createOrder({ status: OrderStatus.SYNCED });
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 5 } });
    for (let i = 0; i < 3; i++) await createOrder({ status: OrderStatus.DISCOVERED });

    expect(await detectBlockedBacklog()).toEqual([]);
  });

  it("flags a backlog at or above the threshold, naming the blocking order first", async () => {
    for (let i = 0; i < 5; i++) await createOrder({ status: OrderStatus.SYNCED });
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 5 } });
    const blocker = await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT });
    for (let i = 0; i < 6; i++) await createOrder({ status: OrderStatus.DISCOVERED });

    const anomalies = await detectBlockedBacklog();

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe(IncidentType.BLOCKED_BACKLOG);
    expect(anomalies[0].relatedOrderIds[0]).toBe(blocker.id);
    expect(anomalies[0].relatedOrderIds).toHaveLength(7); // blocker + 6 discovered
  });

  it("scales severity with backlog size", async () => {
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 0 } });
    for (let i = 0; i < 25; i++) await createOrder({ status: OrderStatus.DISCOVERED });

    const anomalies = await detectBlockedBacklog();

    expect(anomalies[0].severity).toBe(Severity.HIGH);
  });
});
