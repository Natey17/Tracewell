import { z } from "zod";
import { getPrismaClient, OrderStatus, SyncEventType } from "@tracewell/db";
import type Anthropic from "@anthropic-ai/sdk";

const prisma = getPrismaClient();

const orderStatusValues = Object.values(OrderStatus) as string[];
const syncEventTypeValues = Object.values(SyncEventType) as string[];

/**
 * Each tool pairs an Anthropic tool-use JSON schema with a Zod schema (for
 * validating the model's input before it touches Prisma) and a handler.
 * This is the entire surface area the investigation agent can use to look
 * at the database — read-only by construction, no raw SQL, nothing that
 * lets the model mutate pipeline state.
 */
interface ToolDef<T> {
  definition: Anthropic.Tool;
  schema: z.ZodType<T>;
  handler: (input: T) => Promise<unknown>;
}

function orderSummary(order: { id: number; externalId: string; sequenceNumber: number; status: string; customerEmail: string; amountCents: number; currency: string; placedAt: Date; discoveredAt: Date; syncedAt: Date | null; settledAt: Date | null; lastAttemptAt: Date | null; attemptCount: number; lastError: string | null }) {
  return {
    id: order.id,
    externalId: order.externalId,
    sequenceNumber: order.sequenceNumber,
    status: order.status,
    customerEmail: order.customerEmail,
    amountCents: order.amountCents,
    currency: order.currency,
    placedAt: order.placedAt,
    discoveredAt: order.discoveredAt,
    syncedAt: order.syncedAt,
    settledAt: order.settledAt,
    lastAttemptAt: order.lastAttemptAt,
    attemptCount: order.attemptCount,
    lastError: order.lastError,
  };
}

const getOrder: ToolDef<{ orderId?: number; sequenceNumber?: number; externalId?: string }> = {
  definition: {
    name: "get_order",
    description:
      "Fetch a single order by internal id, sourcing-API sequence number, or external id. Provide exactly one identifier.",
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "integer", description: "Internal Tracewell order id" },
        sequenceNumber: { type: "integer", description: "Sourcing API sequence number (arrival order)" },
        externalId: { type: "string", description: "Sourcing API external order id" },
      },
    },
  },
  schema: z.object({
    orderId: z.number().int().optional(),
    sequenceNumber: z.number().int().optional(),
    externalId: z.string().optional(),
  }),
  handler: async (input) => {
    const order = await prisma.order.findFirst({
      where: {
        id: input.orderId,
        sequenceNumber: input.sequenceNumber,
        externalId: input.externalId,
      },
    });
    return order ? orderSummary(order) : { error: "No matching order found" };
  },
};

const listOrdersByStatus: ToolDef<{ status: string; limit?: number; order?: "asc" | "desc" }> = {
  definition: {
    name: "list_orders_by_status",
    description:
      "List orders in a given status, ordered by sequence number. Useful for sampling 'normal' orders as a baseline, or for seeing everything currently stuck/failed.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: orderStatusValues },
        limit: { type: "integer", description: "Max rows to return (default 20, max 100)" },
        order: { type: "string", enum: ["asc", "desc"], description: "Sort by sequenceNumber (default asc)" },
      },
      required: ["status"],
    },
  },
  schema: z.object({
    status: z.enum(orderStatusValues as [string, ...string[]]),
    limit: z.number().int().positive().max(100).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  }),
  handler: async (input) => {
    const orders = await prisma.order.findMany({
      where: { status: input.status as OrderStatus },
      orderBy: { sequenceNumber: input.order ?? "asc" },
      take: Math.min(input.limit ?? 20, 100),
    });
    return { count: orders.length, orders: orders.map(orderSummary) };
  },
};

const getOrderSyncHistory: ToolDef<{ orderId: number }> = {
  definition: {
    name: "get_order_sync_history",
    description: "Get the full chronological event history (discovery, sync attempts, failures, settlement checks) for one order.",
    input_schema: {
      type: "object",
      properties: { orderId: { type: "integer" } },
      required: ["orderId"],
    },
  },
  schema: z.object({ orderId: z.number().int() }),
  handler: async (input) => {
    const events = await prisma.syncEvent.findMany({
      where: { orderId: input.orderId },
      orderBy: { createdAt: "asc" },
    });
    return { count: events.length, events };
  },
};

const getOrdersNearSequence: ToolDef<{ sequenceNumber: number; before?: number; after?: number }> = {
  definition: {
    name: "get_orders_near_sequence",
    description:
      "Get orders with sequence numbers immediately before and after a given sequence number. Useful for seeing what the pipeline processed right before/after a suspect order, and for spotting where a backlog starts.",
    input_schema: {
      type: "object",
      properties: {
        sequenceNumber: { type: "integer" },
        before: { type: "integer", description: "How many orders before (default 3)" },
        after: { type: "integer", description: "How many orders after (default 3)" },
      },
      required: ["sequenceNumber"],
    },
  },
  schema: z.object({
    sequenceNumber: z.number().int(),
    before: z.number().int().min(0).max(50).optional(),
    after: z.number().int().min(0).max(50).optional(),
  }),
  handler: async (input) => {
    const before = input.before ?? 3;
    const after = input.after ?? 3;
    const orders = await prisma.order.findMany({
      where: {
        sequenceNumber: { gte: input.sequenceNumber - before, lte: input.sequenceNumber + after },
      },
      orderBy: { sequenceNumber: "asc" },
    });
    return { count: orders.length, orders: orders.map(orderSummary) };
  },
};

const getPipelineCursor: ToolDef<Record<string, never>> = {
  definition: {
    name: "get_pipeline_cursor",
    description: "Get the sync worker's current cursor position(s) — the last sequence number each named pipeline has fully processed.",
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}),
  handler: async () => {
    const cursors = await prisma.pipelineCursor.findMany();
    return { cursors };
  },
};

const searchSyncEvents: ToolDef<{ type?: string; orderId?: number; sinceMinutesAgo?: number; limit?: number }> = {
  definition: {
    name: "search_sync_events",
    description:
      "Search sync events across all orders, optionally filtered by event type, a specific order, and/or a recency window. Useful for spotting clustered failures.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: syncEventTypeValues },
        orderId: { type: "integer" },
        sinceMinutesAgo: { type: "integer", description: "Only events newer than this many minutes ago" },
        limit: { type: "integer", description: "Max rows (default 50, max 200)" },
      },
    },
  },
  schema: z.object({
    type: z.enum(syncEventTypeValues as [string, ...string[]]).optional(),
    orderId: z.number().int().optional(),
    sinceMinutesAgo: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(200).optional(),
  }),
  handler: async (input) => {
    const events = await prisma.syncEvent.findMany({
      where: {
        type: input.type as SyncEventType | undefined,
        orderId: input.orderId,
        createdAt: input.sinceMinutesAgo ? { gte: new Date(Date.now() - input.sinceMinutesAgo * 60_000) } : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(input.limit ?? 50, 200),
      include: { order: { select: { id: true, sequenceNumber: true, externalId: true } } },
    });
    return { count: events.length, events };
  },
};

const getPipelineStatsTool: ToolDef<Record<string, never>> = {
  definition: {
    name: "get_pipeline_stats",
    description: "Get an aggregate snapshot of pipeline health: order counts by status, backlog size, and recent failure count. Good first call to orient yourself.",
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}),
  handler: async () => {
    const { getPipelineStats } = await import("../services/pipelineStats");
    return getPipelineStats();
  },
};

export const agentTools: ToolDef<any>[] = [
  getPipelineStatsTool,
  getPipelineCursor,
  getOrder,
  listOrdersByStatus,
  getOrderSyncHistory,
  getOrdersNearSequence,
  searchSyncEvents,
];

export const anthropicToolDefinitions: Anthropic.Tool[] = agentTools.map((t) => t.definition);

export async function executeTool(name: string, rawInput: unknown): Promise<unknown> {
  const tool = agentTools.find((t) => t.definition.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: `Invalid input for ${name}: ${parsed.error.message}` };
  }

  try {
    return await tool.handler(parsed.data);
  } catch (err) {
    return { error: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
