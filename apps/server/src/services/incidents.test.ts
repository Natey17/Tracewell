import { describe, it, expect, beforeEach } from "vitest";
import { IncidentType, Severity, IncidentStatus, OrderStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";
import { createIncidentIfNew, autoResolveStaleIncidents } from "./incidents";
import type { DetectedAnomaly } from "../scanner/types";

function anomaly(overrides: Partial<DetectedAnomaly> = {}): DetectedAnomaly {
  return {
    type: IncidentType.STUCK_ORDER,
    severity: Severity.MEDIUM,
    title: "Order #1 stuck in AWAITING_SETTLEMENT",
    summary: "test summary",
    relatedOrderIds: [1],
    dedupeKey: "STUCK_ORDER:1",
    ...overrides,
  };
}

describe("createIncidentIfNew", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("creates a new OPEN incident from an anomaly", async () => {
    const incident = await createIncidentIfNew(anomaly());

    expect(incident).not.toBeNull();
    expect(incident?.status).toBe(IncidentStatus.OPEN);
    expect(incident?.title).toBe("Order #1 stuck in AWAITING_SETTLEMENT");
  });

  it("does not duplicate an incident with the same type+title while one is OPEN", async () => {
    const first = await createIncidentIfNew(anomaly());
    const second = await createIncidentIfNew(anomaly());

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const count = await testPrisma.incident.count();
    expect(count).toBe(1);
  });

  it("does not duplicate while the existing incident is INVESTIGATING", async () => {
    const first = await createIncidentIfNew(anomaly());
    await testPrisma.incident.update({ where: { id: first!.id }, data: { status: IncidentStatus.INVESTIGATING } });

    const second = await createIncidentIfNew(anomaly());
    expect(second).toBeNull();
  });

  it("creates a new incident once the previous one is RESOLVED", async () => {
    const first = await createIncidentIfNew(anomaly());
    await testPrisma.incident.update({ where: { id: first!.id }, data: { status: IncidentStatus.RESOLVED } });

    const second = await createIncidentIfNew(anomaly());
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });

  it("treats a different title as a distinct incident even with the same type", async () => {
    await createIncidentIfNew(anomaly({ title: "Order #1 stuck" }));
    const second = await createIncidentIfNew(anomaly({ title: "Order #2 stuck" }));

    expect(second).not.toBeNull();
    expect(await testPrisma.incident.count()).toBe(2);
  });
});

describe("autoResolveStaleIncidents", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
  });

  it("resolves a STUCK_ORDER incident once the order reaches a terminal state", async () => {
    const order = await createOrder({ status: OrderStatus.SYNCED });
    const incident = await testPrisma.incident.create({
      data: {
        type: IncidentType.STUCK_ORDER,
        severity: Severity.MEDIUM,
        status: IncidentStatus.OPEN,
        title: "stuck",
        summary: "stuck",
        relatedOrderIds: [order.id],
      },
    });

    await autoResolveStaleIncidents();

    const updated = await testPrisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(updated.status).toBe(IncidentStatus.RESOLVED);
    expect(updated.resolvedAt).not.toBeNull();
  });

  it("leaves a STUCK_ORDER incident open while the order is still non-terminal", async () => {
    const order = await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT });
    const incident = await testPrisma.incident.create({
      data: {
        type: IncidentType.STUCK_ORDER,
        severity: Severity.MEDIUM,
        status: IncidentStatus.OPEN,
        title: "stuck",
        summary: "stuck",
        relatedOrderIds: [order.id],
      },
    });

    await autoResolveStaleIncidents();

    const updated = await testPrisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(updated.status).toBe(IncidentStatus.OPEN);
  });

  it("resolves a BLOCKED_BACKLOG incident once the backlog drains below 5", async () => {
    for (let i = 0; i < 3; i++) await createOrder({ status: OrderStatus.SYNCED });
    await testPrisma.pipelineCursor.create({ data: { name: "order-sync", lastProcessedSequenceNumber: 3 } });
    const incident = await testPrisma.incident.create({
      data: {
        type: IncidentType.BLOCKED_BACKLOG,
        severity: Severity.HIGH,
        status: IncidentStatus.OPEN,
        title: "backlog",
        summary: "backlog",
        relatedOrderIds: [],
      },
    });

    await autoResolveStaleIncidents();

    const updated = await testPrisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(updated.status).toBe(IncidentStatus.RESOLVED);
  });

  it("does not touch already-resolved incidents", async () => {
    const incident = await testPrisma.incident.create({
      data: {
        type: IncidentType.DATA_FLOW_GAP,
        severity: Severity.LOW,
        status: IncidentStatus.RESOLVED,
        title: "gap",
        summary: "gap",
        relatedOrderIds: [],
        resolvedAt: new Date(),
      },
    });

    await autoResolveStaleIncidents();

    const updated = await testPrisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(updated.status).toBe(IncidentStatus.RESOLVED);
  });
});
