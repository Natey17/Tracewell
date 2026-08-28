import type Anthropic from "@anthropic-ai/sdk";
import { getPrismaClient, IncidentStatus, ReportStatus } from "@tracewell/db";
import { config } from "../config";
import { getAnthropicClient } from "./client";
import { anthropicToolDefinitions, executeTool } from "./tools";
import { SYSTEM_PROMPT, buildInvestigationPrompt } from "./prompts";

const prisma = getPrismaClient();

const MAX_TOOL_ITERATIONS = 12;

const SUBMIT_REPORT_TOOL: Anthropic.Tool = {
  name: "submit_incident_report",
  description: "Submit your final root-cause investigation report. Call this exactly once, after gathering evidence.",
  // strict:true (with additionalProperties:false + required on every object
  // level) makes the API validate tool_use.input against this schema before
  // returning it, so a partial report can't reach the database.
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      rootCause: {
        type: "string",
        description: "Clear explanation of the root cause, written for a human engineer reading it cold.",
      },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      affectedOrderIds: {
        type: "array",
        items: { type: "integer" },
        description: "Internal order ids materially affected by this issue (the cause and/or the orders blocked by it).",
      },
      evidenceTrail: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "integer" },
            finding: { type: "string", description: "One short sentence: what you checked and what you found." },
          },
          required: ["step", "finding"],
          additionalProperties: false,
        },
        description: "A short chronological list of what you investigated and found, so a human can follow your reasoning.",
      },
      recommendedActions: {
        type: "array",
        items: { type: "string" },
        description: "Concrete next steps to fix this and prevent recurrence.",
      },
    },
    required: ["rootCause", "confidence", "affectedOrderIds", "evidenceTrail", "recommendedActions"],
    additionalProperties: false,
  },
};

interface SubmittedReport {
  rootCause: string;
  confidence: string;
  affectedOrderIds: number[];
  evidenceTrail: { step: number; finding: string }[];
  recommendedActions: string[];
}

export async function runInvestigation(incidentId: number): Promise<void> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  await prisma.incident.update({ where: { id: incidentId }, data: { status: IncidentStatus.INVESTIGATING } });

  try {
    const report = await investigate(incident);
    await prisma.incidentReport.create({
      data: {
        incidentId,
        status: ReportStatus.SUCCESS,
        model: config.anthropicModel,
        rootCause: report.rootCause,
        confidence: report.confidence,
        affectedOrderIds: report.affectedOrderIds,
        evidenceTrail: report.evidenceTrail,
        recommendedActions: report.recommendedActions,
        rawModelOutput: report as unknown as object,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] investigation failed for incident ${incidentId}:`, message);
    await prisma.incidentReport.create({
      data: {
        incidentId,
        status: ReportStatus.FAILED,
        model: config.anthropicModel,
        rootCause: "",
        confidence: "low",
        affectedOrderIds: [],
        evidenceTrail: [],
        recommendedActions: [],
        errorMessage: message,
      },
    });
  } finally {
    await prisma.incident.update({ where: { id: incidentId }, data: { status: IncidentStatus.OPEN } });
  }
}

async function investigate(incident: {
  type: string;
  severity: string;
  title: string;
  summary: string;
  relatedOrderIds: number[];
}): Promise<SubmittedReport> {
  const anthropic = getAnthropicClient();
  const tools = [...anthropicToolDefinitions, SUBMIT_REPORT_TOOL];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildInvestigationPrompt({
        incidentType: incident.type,
        severity: incident.severity,
        title: incident.title,
        summary: incident.summary,
        relatedOrderIds: incident.relatedOrderIds,
      }),
    },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const submitBlock = toolUseBlocks.find((b) => b.name === "submit_incident_report");
    if (submitBlock) {
      return submitBlock.input as SubmittedReport;
    }

    if (toolUseBlocks.length === 0) {
      // Model stopped without submitting a report; nudge it once more.
      messages.push({
        role: "user",
        content: "Please continue investigating with tools, then call submit_incident_report with your findings.",
      });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result, null, 2),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Investigation exceeded ${MAX_TOOL_ITERATIONS} tool-use iterations without a submitted report`);
}
