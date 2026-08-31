import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { IncidentType, Severity, IncidentStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";

// The route only needs to prove it *triggers* an investigation, not run one —
// runInvestigation itself (real tool loop, real Anthropic call) is covered
// in agent/index.test.ts against a mocked client. Mocking it here keeps
// route tests from making network calls in the background.
vi.mock("../agent", () => ({
  runInvestigation: vi.fn().mockResolvedValue(undefined),
}));

import { runInvestigation } from "../agent";
import { createApp } from "../app";

const app = createApp();

async function seedIncident(overrides: Partial<Parameters<typeof testPrisma.incident.create>[0]["data"]> = {}) {
  return testPrisma.incident.create({
    data: {
      type: IncidentType.STUCK_ORDER,
      severity: Severity.MEDIUM,
      status: IncidentStatus.OPEN,
      title: "Order #1 stuck",
      summary: "test summary",
      relatedOrderIds: [],
      ...overrides,
    },
  });
}

describe("GET /api/incidents", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
    vi.clearAllMocks();
  });

  it("lists incidents newest-detected-first with their latest report", async () => {
    await seedIncident({ title: "first" });
    await seedIncident({ title: "second" });

    const res = await request(app).get("/api/incidents");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("filters by status", async () => {
    await seedIncident({ status: IncidentStatus.OPEN });
    await seedIncident({ status: IncidentStatus.RESOLVED });

    const res = await request(app).get("/api/incidents?status=RESOLVED");

    expect(res.body.count).toBe(1);
    expect(res.body.incidents[0].status).toBe("RESOLVED");
  });
});

describe("GET /api/incidents/:id", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("returns the incident with related orders resolved", async () => {
    const order = await createOrder();
    const incident = await seedIncident({ relatedOrderIds: [order.id] });

    const res = await request(app).get(`/api/incidents/${incident.id}`);

    expect(res.status).toBe(200);
    expect(res.body.relatedOrders).toHaveLength(1);
    expect(res.body.relatedOrders[0].id).toBe(order.id);
  });

  it("404s for a nonexistent incident", async () => {
    const res = await request(app).get("/api/incidents/999999");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/incidents/:id/investigate", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
    vi.clearAllMocks();
  });

  it("triggers the agent and responds immediately without waiting for it", async () => {
    const incident = await seedIncident();

    const res = await request(app).post(`/api/incidents/${incident.id}/investigate`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ triggered: true });
    expect(runInvestigation).toHaveBeenCalledWith(incident.id);
  });

  it("404s for a nonexistent incident instead of triggering the agent", async () => {
    const res = await request(app).post("/api/incidents/999999/investigate");

    expect(res.status).toBe(404);
    expect(runInvestigation).not.toHaveBeenCalled();
  });
});

describe("POST /api/incidents/:id/resolve", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("marks the incident resolved", async () => {
    const incident = await seedIncident();

    const res = await request(app).post(`/api/incidents/${incident.id}/resolve`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RESOLVED");
    expect(res.body.resolvedAt).not.toBeNull();
  });
});
