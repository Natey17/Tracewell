import { getPrismaClient, OrderStatus, Severity, IncidentType } from "@tracewell/db";
import { DetectedAnomaly } from "../types";

/**
 * Orders sitting in a non-terminal status for longer than the threshold.
 * This is the "one order silently stuck" half of the original bug.
 */
export async function detectStuckOrders(thresholdMinutes: number): Promise<DetectedAnomaly[]> {
  const prisma = getPrismaClient();
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);

  const stuck = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.SYNCING, OrderStatus.AWAITING_SETTLEMENT] },
      OR: [{ lastAttemptAt: { lt: cutoff } }, { lastAttemptAt: null, discoveredAt: { lt: cutoff } }],
    },
    orderBy: { sequenceNumber: "asc" },
  });

  return stuck.map((order) => {
    const stuckSince = order.lastAttemptAt ?? order.discoveredAt;
    const stuckMinutes = Math.round((Date.now() - stuckSince.getTime()) / 60_000);
    const stuckHours = (stuckMinutes / 60).toFixed(1);

    let severity: Severity = Severity.MEDIUM;
    if (stuckMinutes > 60 * 24 * 2) severity = Severity.CRITICAL;
    else if (stuckMinutes > 60 * 12) severity = Severity.HIGH;

    return {
      type: IncidentType.STUCK_ORDER,
      severity,
      title: `Order #${order.sequenceNumber} stuck in ${order.status}`,
      summary: `Order ${order.externalId} (sequence #${order.sequenceNumber}) has been in ${order.status} for ~${stuckHours}h (last attempt: ${stuckSince.toISOString()}).`,
      relatedOrderIds: [order.id],
      dedupeKey: `STUCK_ORDER:${order.id}`,
    };
  });
}
