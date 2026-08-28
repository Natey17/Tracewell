import { getPrismaClient, Incident, IncidentStatus, OrderStatus } from "@tracewell/db";
import { DetectedAnomaly } from "../scanner/types";

const prisma = getPrismaClient();

/**
 * Creates an incident for a freshly detected anomaly unless an open one
 * already covers the same underlying condition (tracked via dedupeKey,
 * stashed in the summary-adjacent title lookup below since it isn't its
 * own column — cheap enough at this data volume).
 */
export async function createIncidentIfNew(anomaly: DetectedAnomaly): Promise<Incident | null> {
  const existing = await prisma.incident.findFirst({
    where: {
      type: anomaly.type,
      status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
      title: anomaly.title,
    },
  });
  if (existing) return null;

  return prisma.incident.create({
    data: {
      type: anomaly.type,
      severity: anomaly.severity,
      status: IncidentStatus.OPEN,
      title: anomaly.title,
      summary: anomaly.summary,
      relatedOrderIds: anomaly.relatedOrderIds,
    },
  });
}

/**
 * Closes out incidents whose underlying condition no longer holds — e.g.
 * the stuck order finally settled, or the backlog drained.
 */
export async function autoResolveStaleIncidents(): Promise<void> {
  const open = await prisma.incident.findMany({
    where: { status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] } },
  });

  for (const incident of open) {
    let stillActive = true;

    if (incident.type === "STUCK_ORDER") {
      const order = await prisma.order.findUnique({ where: { id: incident.relatedOrderIds[0] } });
      const activeStatuses: OrderStatus[] = [OrderStatus.SYNCING, OrderStatus.AWAITING_SETTLEMENT];
      stillActive = !!order && activeStatuses.includes(order.status);
    } else if (incident.type === "BLOCKED_BACKLOG") {
      const cursor = await prisma.pipelineCursor.findUnique({ where: { name: "order-sync" } });
      if (cursor) {
        const stillBlocked = await prisma.order.count({
          where: { sequenceNumber: { gt: cursor.lastProcessedSequenceNumber }, status: { not: OrderStatus.SYNCED } },
        });
        stillActive = stillBlocked >= 5;
      }
    } else if (incident.type === "SYNC_FAILURE_SPIKE" || incident.type === "DATA_FLOW_GAP") {
      // These are rolling-window conditions; treat anything older than the
      // window as naturally stale rather than re-querying the window here.
      const ageMinutes = (Date.now() - incident.detectedAt.getTime()) / 60_000;
      stillActive = ageMinutes < 180;
    }

    if (!stillActive) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: IncidentStatus.RESOLVED, resolvedAt: new Date() },
      });
    }
  }
}
