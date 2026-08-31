import { describe, it, expect, beforeEach, vi } from "vitest";
import { IncidentType, Severity, IncidentStatus, ReportStatus } from "@tracewell/db";
import { resetDb, createOrder, resetSequenceCounter, testPrisma } from "../../test/helpers";

// The agent loop is tested against a scripted fake Anthropic client rather
// than a live API call: deterministic, free, and fast, while still
// exercising the real tool-execution path (executeTool hits the real test
// database) and the real Zod validation on the final report.
vi.mock("./client", () => ({
  getAnthropicClient: vi.fn(),
}));

import { getAnthropicClient } from "./client";
import { runInvestigation } from "./index";

function toolUseMessage(name: string, input: unknown, id = "tool_1") {
  return { content: [{ type: "tool_use", id, name, input }] };
}

function textOnlyMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

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

const VALID_REPORT = {
  rootCause: "The payments provider never confirmed settlement.",
  confidence: "high",
  affectedOrderIds: [1],
  evidenceTrail: [{ step: 1, finding: "Checked order history." }],
  recommendedActions: ["Contact the payments provider."],
};

describe("runInvestigation", () => {
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDb();
    resetSequenceCounter();
    createMock = vi.fn();
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: createMock } } as never);
  });

  it("writes a SUCCESS report and returns the incident to OPEN when the model submits directly", async () => {
    createMock.mockResolvedValueOnce(toolUseMessage("submit_incident_report", VALID_REPORT));
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    const updated = await testPrisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { reports: true },
    });
    expect(updated.status).toBe(IncidentStatus.OPEN);
    expect(updated.reports).toHaveLength(1);
    expect(updated.reports[0].status).toBe(ReportStatus.SUCCESS);
    expect(updated.reports[0].rootCause).toBe(VALID_REPORT.rootCause);
    expect(updated.reports[0].confidence).toBe("high");
  });

  it("sets status to INVESTIGATING while the loop is running", async () => {
    let statusDuringCall: IncidentStatus | undefined;
    createMock.mockImplementationOnce(async () => {
      const incident = await testPrisma.incident.findFirstOrThrow();
      statusDuringCall = incident.status;
      return toolUseMessage("submit_incident_report", VALID_REPORT);
    });
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    expect(statusDuringCall).toBe(IncidentStatus.INVESTIGATING);
  });

  it("executes real tool calls against the database before submitting", async () => {
    const order = await createOrder({ currency: "MXN" });
    createMock
      .mockResolvedValueOnce(toolUseMessage("get_order", { orderId: order.id }))
      .mockResolvedValueOnce(toolUseMessage("submit_incident_report", { ...VALID_REPORT, affectedOrderIds: [order.id] }));
    const incident = await seedIncident({ relatedOrderIds: [order.id] });

    await runInvestigation(incident.id);

    // Second call's message history should contain the real tool_result,
    // proving executeTool actually ran against the test database rather
    // than the loop just trusting a scripted response.
    const secondCallMessages = createMock.mock.calls[1][0].messages;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResultMessage = secondCallMessages.find(
      (m: any) => m.role === "user" && Array.isArray(m.content) && m.content[0]?.type === "tool_result"
    );
    expect(toolResultMessage.content[0].content).toContain("MXN");

    const report = await testPrisma.incidentReport.findFirstOrThrow({ where: { incidentId: incident.id } });
    expect(report.affectedOrderIds).toEqual([order.id]);
  });

  it("nudges the model to continue when it stops without calling any tool", async () => {
    createMock
      .mockResolvedValueOnce(textOnlyMessage("Let me think about this."))
      .mockResolvedValueOnce(toolUseMessage("submit_incident_report", VALID_REPORT));
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    expect(createMock).toHaveBeenCalledTimes(2);
    const report = await testPrisma.incidentReport.findFirstOrThrow({ where: { incidentId: incident.id } });
    expect(report.status).toBe(ReportStatus.SUCCESS);
  });

  it("writes a FAILED report when the model submits a malformed report (regression: missing field)", async () => {
    const { recommendedActions: _omit, ...malformed } = VALID_REPORT;
    void _omit;
    createMock.mockResolvedValueOnce(toolUseMessage("submit_incident_report", malformed));
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    const updated = await testPrisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { reports: true },
    });
    expect(updated.status).toBe(IncidentStatus.OPEN);
    expect(updated.reports[0].status).toBe(ReportStatus.FAILED);
    expect(updated.reports[0].errorMessage).toContain("malformed report");
  });

  it("writes a FAILED report after exceeding the max tool-use iterations without a submission", async () => {
    createMock.mockResolvedValue(toolUseMessage("get_pipeline_stats", {}));
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    const report = await testPrisma.incidentReport.findFirstOrThrow({ where: { incidentId: incident.id } });
    expect(report.status).toBe(ReportStatus.FAILED);
    expect(report.errorMessage).toContain("exceeded");
  });

  it("writes a FAILED report and restores OPEN status when the API call itself throws", async () => {
    createMock.mockRejectedValueOnce(new Error("anthropic-workspace-id is required"));
    const incident = await seedIncident();

    await runInvestigation(incident.id);

    const updated = await testPrisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { reports: true },
    });
    expect(updated.status).toBe(IncidentStatus.OPEN);
    expect(updated.reports[0].status).toBe(ReportStatus.FAILED);
    expect(updated.reports[0].errorMessage).toContain("workspace-id");
  });

  it("throws for a nonexistent incident id", async () => {
    await expect(runInvestigation(999999)).rejects.toThrow("not found");
  });
});
