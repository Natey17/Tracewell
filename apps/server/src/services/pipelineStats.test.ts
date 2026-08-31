import { describe, it, expect, beforeEach } from "vitest";
import { OrderStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";
import { getPipelineStats } from "./pipelineStats";

describe("getPipelineStats", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("reports zero counts on an empty database", async () => {
    const stats = await getPipelineStats();

    expect(stats.totalOrders).toBe(0);
    expect(stats.byStatus).toEqual({});
    expect(stats.cursor).toBeNull();
    expect(stats.backlogCount).toBe(0);
    expect(stats.oldestStuckOrder).toBeNull();
  });

  it("tallies orders by status", async () => {
    await createOrder({ status: OrderStatus.SYNCED });
    await createOrder({ status: OrderStatus.SYNCED });
    await createOrder({ status: OrderStatus.DISCOVERED });

    const stats = await getPipelineStats();

    expect(stats.totalOrders).toBe(3);
    expect(stats.byStatus.SYNCED).toBe(2);
    expect(stats.byStatus.DISCOVERED).toBe(1);
  });

  it("computes backlogCount relative to the pipeline cursor", async () => {
    for (let i = 0; i < 3; i++) await createOrder({ status: OrderStatus.SYNCED });
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 3 } });
    for (let i = 0; i < 4; i++) await createOrder({ status: OrderStatus.DISCOVERED });

    const stats = await getPipelineStats();

    expect(stats.backlogCount).toBe(4);
    expect(stats.cursor).toEqual({ name: "order-sync", lastProcessedSequenceNumber: 3 });
  });

  it("identifies the oldest stuck order by lastAttemptAt", async () => {
    const older = await createOrder({
      status: OrderStatus.AWAITING_SETTLEMENT,
      lastAttemptAt: new Date(Date.now() - 60 * 60_000),
    });
    await createOrder({
      status: OrderStatus.SYNCING,
      lastAttemptAt: new Date(Date.now() - 5 * 60_000),
    });

    const stats = await getPipelineStats();

    expect(stats.oldestStuckOrder?.id).toBe(older.id);
  });

  it("buckets syncedAt into daily counts for the last 14 days", async () => {
    const today = new Date();
    await createOrder({ syncedAt: today });
    await createOrder({ syncedAt: today });
    await createOrder({ syncedAt: new Date(Date.now() - 20 * 24 * 60 * 60_000) }); // outside the 14-day window

    const stats = await getPipelineStats();
    const todayKey = today.toISOString().slice(0, 10);
    const todayBucket = stats.dailySyncedCounts.find((d) => d.date === todayKey);

    expect(stats.dailySyncedCounts).toHaveLength(14);
    expect(todayBucket?.count).toBe(2);
  });
});
