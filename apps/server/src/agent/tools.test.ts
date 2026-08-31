import { describe, it, expect, beforeEach } from "vitest";
import { OrderStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";
import { executeTool } from "./tools";

describe("executeTool", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns an error for an unknown tool name", async () => {
    const result = await executeTool("not_a_real_tool", {});
    expect(result).toEqual({ error: expect.stringContaining("Unknown tool") });
  });

  it("returns a validation error instead of throwing on malformed input", async () => {
    const result = await executeTool("get_order", { orderId: "not-a-number" });
    expect(result).toMatchObject({ error: expect.stringContaining("Invalid input") });
  });

  it("get_order finds a matching order by internal id", async () => {
    const order = await createOrder({ currency: "MXN" });

    const result = (await executeTool("get_order", { orderId: order.id })) as { currency: string };

    expect(result.currency).toBe("MXN");
  });

  it("get_order reports no match cleanly rather than throwing", async () => {
    const result = await executeTool("get_order", { orderId: 999999 });
    expect(result).toEqual({ error: "No matching order found" });
  });

  it("list_orders_by_status filters and caps at the requested limit", async () => {
    for (let i = 0; i < 5; i++) await createOrder({ status: OrderStatus.DISCOVERED });
    await createOrder({ status: OrderStatus.SYNCED });

    const result = (await executeTool("list_orders_by_status", { status: "DISCOVERED", limit: 3 })) as {
      count: number;
      orders: unknown[];
    };

    expect(result.count).toBe(3);
    expect(result.orders).toHaveLength(3);
  });

  it("get_order_sync_history returns events in chronological order", async () => {
    const order = await createOrder();
    await testPrisma.syncEvent.create({
      data: { orderId: order.id, type: "SYNC_SUCCESS", message: "second", createdAt: new Date(Date.now()) },
    });
    await testPrisma.syncEvent.create({
      data: { orderId: order.id, type: "DISCOVERED", message: "first", createdAt: new Date(Date.now() - 60_000) },
    });

    const result = (await executeTool("get_order_sync_history", { orderId: order.id })) as {
      count: number;
      events: { message: string }[];
    };

    expect(result.count).toBe(2);
    expect(result.events.map((e) => e.message)).toEqual(["first", "second"]);
  });

  it("get_orders_near_sequence returns a window around the target sequence", async () => {
    for (let i = 0; i < 10; i++) await createOrder();

    const result = (await executeTool("get_orders_near_sequence", { sequenceNumber: 5, before: 2, after: 2 })) as {
      orders: { sequenceNumber: number }[];
    };

    expect(result.orders.map((o) => o.sequenceNumber)).toEqual([3, 4, 5, 6, 7]);
  });

  it("get_pipeline_cursor lists all cursors", async () => {
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 42 } });

    const result = (await executeTool("get_pipeline_cursor", {})) as { cursors: { name: string }[] };

    expect(result.cursors).toHaveLength(1);
    expect(result.cursors[0].name).toBe("order-sync");
  });

  it("search_sync_events filters by type and recency window", async () => {
    const order = await createOrder();
    await testPrisma.syncEvent.create({
      data: { orderId: order.id, type: "SYNC_FAILURE", message: "recent", createdAt: new Date() },
    });
    await testPrisma.syncEvent.create({
      data: {
        orderId: order.id,
        type: "SYNC_FAILURE",
        message: "old",
        createdAt: new Date(Date.now() - 120 * 60_000),
      },
    });

    const result = (await executeTool("search_sync_events", { type: "SYNC_FAILURE", sinceMinutesAgo: 60 })) as {
      count: number;
    };

    expect(result.count).toBe(1);
  });

  it("get_pipeline_stats delegates to the pipeline stats service", async () => {
    await createOrder({ status: OrderStatus.SYNCED });

    const result = (await executeTool("get_pipeline_stats", {})) as { totalOrders: number };

    expect(result.totalOrders).toBe(1);
  });
});
