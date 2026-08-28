import { getPrismaClient, Severity, IncidentType } from "@tracewell/db";
import { DetectedAnomaly } from "../types";

const WINDOW_MINUTES = 60;
const FAILURE_ALERT_THRESHOLD = 5;

/**
 * A burst of SYNC_FAILURE events in a short rolling window — distinct from
 * a single stuck order, this is "the sourcing API is currently unhappy."
 */
export async function detectSyncFailureSpike(): Promise<DetectedAnomaly[]> {
  const prisma = getPrismaClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const failures = await prisma.syncEvent.findMany({
    where: { type: "SYNC_FAILURE", createdAt: { gte: since } },
    select: { orderId: true },
  });

  if (failures.length < FAILURE_ALERT_THRESHOLD) return [];

  const orderIds = [...new Set(failures.map((f) => f.orderId))];
  let severity: Severity = Severity.MEDIUM;
  if (failures.length >= 25) severity = Severity.CRITICAL;
  else if (failures.length >= 10) severity = Severity.HIGH;

  return [
    {
      type: IncidentType.SYNC_FAILURE_SPIKE,
      severity,
      title: `${failures.length} sync failures in the last ${WINDOW_MINUTES} minutes`,
      summary: `${failures.length} SYNC_FAILURE events logged across ${orderIds.length} orders within the last ${WINDOW_MINUTES} minutes.`,
      relatedOrderIds: orderIds.slice(0, 25),
      dedupeKey: `SYNC_FAILURE_SPIKE:current`,
    },
  ];
}
