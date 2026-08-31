import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { OrderStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";
import { createApp } from "../app";

const app = createApp();

describe("GET /api/orders", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("lists orders newest-sequence-first", async () => {
    await createOrder();
    await createOrder();
    await createOrder();

    const res = await request(app).get("/api/orders");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.orders.map((o: { sequenceNumber: number }) => o.sequenceNumber)).toEqual([3, 2, 1]);
  });

  it("filters by status", async () => {
    await createOrder({ status: OrderStatus.DISCOVERED });
    await createOrder({ status: OrderStatus.SYNCED });

    const res = await request(app).get("/api/orders?status=SYNCED");

    expect(res.body.count).toBe(1);
    expect(res.body.orders[0].status).toBe("SYNCED");
  });

  it("caps results at the requested limit", async () => {
    for (let i = 0; i < 5; i++) await createOrder();

    const res = await request(app).get("/api/orders?limit=2");

    expect(res.body.orders).toHaveLength(2);
  });
});

describe("GET /api/orders/:id", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns the order with its event history", async () => {
    const order = await createOrder();
    await testPrisma.syncEvent.create({ data: { orderId: order.id, type: "DISCOVERED", message: "found it" } });

    const res = await request(app).get(`/api/orders/${order.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
    expect(res.body.events).toHaveLength(1);
  });

  it("404s for a nonexistent order", async () => {
    const res = await request(app).get("/api/orders/999999");
    expect(res.status).toBe(404);
  });

  it("400s for a non-numeric id", async () => {
    const res = await request(app).get("/api/orders/not-a-number");
    expect(res.status).toBe(400);
  });
});
