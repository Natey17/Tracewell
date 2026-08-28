import { getPrismaClient, Severity, IncidentType } from "@tracewell/db";
import { DetectedAnomaly } from "../types";

/**
 * If nothing new has been discovered from the sourcing API in longer than
 * expected, the *upstream* feed itself may be down — different from orders
 * piling up downstream while discovery keeps working fine.
 */
export async function detectDataFlowGaps(thresholdMinutes: number): Promise<DetectedAnomaly[]> {
  const prisma = getPrismaClient();

  const latest = await prisma.order.findFirst({ orderBy: { discoveredAt: "desc" } });
  if (!latest) return [];

  const gapMinutes = Math.round((Date.now() - latest.discoveredAt.getTime()) / 60_000);
  if (gapMinutes < thresholdMinutes) return [];

  const gapHours = (gapMinutes / 60).toFixed(1);
  let severity: Severity = Severity.MEDIUM;
  if (gapMinutes > 60 * 12) severity = Severity.CRITICAL;
  else if (gapMinutes > 60 * 4) severity = Severity.HIGH;

  return [
    {
      type: IncidentType.DATA_FLOW_GAP,
      severity,
      title: `No new orders discovered in ~${gapHours}h`,
      summary: `The most recently discovered order (#${latest.sequenceNumber}) arrived ${latest.discoveredAt.toISOString()}, ~${gapHours}h ago. The sourcing API feed may be down or the discovery poller may have stopped.`,
      relatedOrderIds: [latest.id],
      dedupeKey: `DATA_FLOW_GAP:current`,
    },
  ];
}
