import { getPrismaClient, OrderStatus, Severity, IncidentType } from "@tracewell/db";
import { DetectedAnomaly } from "../types";

const CURSOR_NAME = "order-sync";
const BACKLOG_ALERT_THRESHOLD = 5;

/**
 * Compares the pipeline's processing cursor against orders discovered after
 * it. A growing gap here means downstream orders exist but can't advance —
 * the "silent blocked backlog" half of the original bug, and the hardest
 * part to notice because discovery keeps happening normally.
 */
export async function detectBlockedBacklog(): Promise<DetectedAnomaly[]> {
  const prisma = getPrismaClient();
  const cursor = await prisma.pipelineCursor.findUnique({ where: { name: CURSOR_NAME } });
  if (!cursor) return [];

  const blocked = await prisma.order.findMany({
    where: {
      sequenceNumber: { gt: cursor.lastProcessedSequenceNumber },
      status: { not: OrderStatus.SYNCED },
    },
    orderBy: { sequenceNumber: "asc" },
  });

  if (blocked.length < BACKLOG_ALERT_THRESHOLD) return [];

  const blockingOrder = blocked[0];
  const oldestDiscovered = blocked.reduce(
    (min, o) => (o.discoveredAt < min ? o.discoveredAt : min),
    blocked[0].discoveredAt
  );
  const ageHours = ((Date.now() - oldestDiscovered.getTime()) / (60 * 60_000)).toFixed(1);

  let severity: Severity = Severity.MEDIUM;
  if (blocked.length >= 50) severity = Severity.CRITICAL;
  else if (blocked.length >= 20) severity = Severity.HIGH;

  return [
    {
      type: IncidentType.BLOCKED_BACKLOG,
      severity,
      title: `${blocked.length} orders blocked behind order #${blockingOrder.sequenceNumber}`,
      summary: `Pipeline cursor "${CURSOR_NAME}" is stalled at sequence #${cursor.lastProcessedSequenceNumber}. ${blocked.length} orders with higher sequence numbers (starting #${blockingOrder.sequenceNumber}) have not synced, the oldest discovered ~${ageHours}h ago.`,
      relatedOrderIds: blocked.slice(0, 25).map((o) => o.id),
      dedupeKey: `BLOCKED_BACKLOG:${CURSOR_NAME}`,
    },
  ];
}
