import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { resetDb, createOrder, resetSequenceCounter } from "../../test/helpers";
import { createApp } from "../app";

// /api/pipeline/scan can create incidents and fire off real investigations;
// mock the agent so a scan test never makes a live Anthropic call.
vi.mock("../agent", () => ({
  runInvestigation: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();

describe("GET /api/pipeline/stats", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns a stats snapshot reflecting current orders", async () => {
    await createOrder();
    await createOrder();

    const res = await request(app).get("/api/pipeline/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(2);
    expect(res.body.dailySyncedCounts).toHaveLength(14);
  });
});

describe("POST /api/pipeline/scan", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("runs a scan cycle and creates an incident for a stuck order", async () => {
    await createOrder({
      status: "AWAITING_SETTLEMENT",
      lastAttemptAt: new Date(Date.now() - 61 * 60_000),
    });

    const res = await request(app).post("/api/pipeline/scan");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ triggered: true });

    const incidents = await request(app).get("/api/incidents");
    expect(incidents.body.count).toBeGreaterThanOrEqual(1);
  });
});
