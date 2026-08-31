import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IncidentType, Severity, IncidentStatus, OrderStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";

const mockConfig = vi.hoisted(() => ({
  stuckOrderThresholdMinutes: 60,
  dataFlowGapThresholdMinutes: 120,
  anthropicApiKey: "sk-test",
  scannerIntervalSeconds: 30,
}));
vi.mock("../config", () => ({ config: mockConfig }));

// The scanner only needs to prove it *calls* the agent for a fresh incident;
// the agent's own behavior is covered in agent/index.test.ts.
vi.mock("../agent", () => ({ runInvestigation: vi.fn().mockResolvedValue(undefined) }));

import { runInvestigation } from "../agent";
import { runScanCycle, startScanner } from "./index";

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

describe("runScanCycle", () => {
  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
    vi.clearAllMocks();
    mockConfig.anthropicApiKey = "sk-test";
  });

  it("creates an incident from a real detected anomaly and triggers investigation", async () => {
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(90) });

    await runScanCycle();

    const incidents = await testPrisma.incident.findMany();
    expect(incidents).toHaveLength(1);
    expect(incidents[0].type).toBe(IncidentType.STUCK_ORDER);
    expect(runInvestigation).toHaveBeenCalledWith(incidents[0].id);
  });

  it("skips triggering investigation when no API key is configured", async () => {
    mockConfig.anthropicApiKey = "";
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(90) });

    await runScanCycle();

    expect(await testPrisma.incident.count()).toBe(1);
    expect(runInvestigation).not.toHaveBeenCalled();
  });

  it("does not duplicate incidents across repeated cycles", async () => {
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(90) });

    await runScanCycle();
    await runScanCycle();

    expect(await testPrisma.incident.count()).toBe(1);
  });

  it("auto-resolves a stale incident before scanning for new ones", async () => {
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
    await testPrisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.SYNCED } });

    await runScanCycle();

    const updated = await testPrisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(updated.status).toBe(IncidentStatus.RESOLVED);
  });

  it("skips a scan cycle that's already in progress instead of running concurrently", async () => {
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(90) });

    // Both calls happen synchronously before either's first await resolves,
    // so the second one must see `scanning` already true and bail out —
    // if the guard were broken, this would race and could double-create.
    await Promise.all([runScanCycle(), runScanCycle()]);

    expect(await testPrisma.incident.count()).toBe(1);
  });

  it("does not throw when a detector step fails, and clears the in-progress flag", async () => {
    mockConfig.stuckOrderThresholdMinutes = -1; // deliberately odd but not fatal
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(1) });

    await expect(runScanCycle()).resolves.toBeUndefined();
    // A subsequent cycle must still be able to run (flag was reset).
    await expect(runScanCycle()).resolves.toBeUndefined();

    mockConfig.stuckOrderThresholdMinutes = 60;
  });
});

describe("startScanner", () => {
  let timer: NodeJS.Timeout | undefined;

  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
    vi.clearAllMocks();
    mockConfig.anthropicApiKey = "sk-test";
  });

  afterEach(() => {
    if (timer) clearInterval(timer);
  });

  it("runs an immediate scan cycle on start, without waiting for the interval", async () => {
    await createOrder({ status: OrderStatus.AWAITING_SETTLEMENT, lastAttemptAt: minutesAgo(90) });

    timer = startScanner();
    // The immediate cycle is fire-and-forget (`void runScanCycle()`); give
    // its real DB queries a tick to land before asserting on their effect.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await testPrisma.incident.count()).toBe(1);
  });
});
