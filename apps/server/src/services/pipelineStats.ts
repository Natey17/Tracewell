import { getPrismaClient, OrderStatus } from "@tracewell/db";

const prisma = getPrismaClient();
const CURSOR_NAME = "order-sync";

export async function getPipelineStats() {
  const [statusCounts, cursor, latestOrder, recentFailures, dailySynced] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.pipelineCursor.findUnique({ where: { name: CURSOR_NAME } }),
    prisma.order.findFirst({ orderBy: { discoveredAt: "desc" } }),
    prisma.syncEvent.count({ where: { type: "SYNC_FAILURE", createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } }),
    getDailySyncedCounts(14),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) byStatus[row.status] = row._count._all;

  const backlogCount = cursor
    ? await prisma.order.count({
        where: { sequenceNumber: { gt: cursor.lastProcessedSequenceNumber }, status: { not: OrderStatus.SYNCED } },
      })
    : 0;

  const oldestStuck = await prisma.order.findFirst({
    where: { status: { in: [OrderStatus.SYNCING, OrderStatus.AWAITING_SETTLEMENT] } },
    orderBy: { lastAttemptAt: "asc" },
  });

  return {
    totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    cursor: cursor
      ? { name: cursor.name, lastProcessedSequenceNumber: cursor.lastProcessedSequenceNumber }
      : null,
    backlogCount,
    oldestStuckOrder: oldestStuck
      ? {
          id: oldestStuck.id,
          sequenceNumber: oldestStuck.sequenceNumber,
          status: oldestStuck.status,
          stuckSince: oldestStuck.lastAttemptAt ?? oldestStuck.discoveredAt,
        }
      : null,
    recentFailureCount: recentFailures,
    lastDiscoveredAt: latestOrder?.discoveredAt ?? null,
    dailySyncedCounts: dailySynced,
  };
}

async function getDailySyncedCounts(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const synced = await prisma.order.findMany({
    where: { syncedAt: { gte: since } },
    select: { syncedAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60_000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const { syncedAt } of synced) {
    if (!syncedAt) continue;
    const key = syncedAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }));
}
