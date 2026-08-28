/**
 * Seeds a mock order-sync pipeline that reproduces the head-of-line-blocking
 * bug this project exists to catch: one order stuck in AWAITING_SETTLEMENT
 * silently blocks every order discovered after it, even though the
 * third-party API keeps handing new orders to the (independent) discovery
 * poller the whole time.
 *
 * Layout after seeding (sequenceNumber ranges):
 *   1..300    healthy history, fully SYNCED, spread over the last ~20 days
 *   150..157  a transient SYNC_FAILURE_SPIKE inside the healthy history,
 *             already resolved, with a canned historical incident + report
 *             so the dashboard has more than one incident on first load
 *   301       the poison order: reaches SETTLEMENT_CHECK and then never
 *             confirms, because it's the one order in the dataset priced in
 *             a currency (MXN) the settlement webhook handler never learned
 *             about — left for the agent to notice by comparing it against
 *             its siblings, not stated outright
 *   302..351  the resulting backlog: discovered normally, never advanced
 *             past DISCOVERED because the sync worker won't move past 301
 *
 * PipelineCursor("order-sync") is left at 300, i.e. one behind the poison
 * order — exactly where the real worker would be stuck.
 *
 * This script is intentionally deterministic (seeded RNG) so re-running
 * `npm run db:reset && npm run db:seed` always reproduces the same demo.
 */
import { faker } from "@faker-js/faker";
import { PrismaClient, OrderStatus, SyncEventType, IncidentType, Severity, IncidentStatus, ReportStatus } from "../generated/client";

faker.seed(20260828);

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

function minutesAgo(mins: number): Date {
  return new Date(now - mins * 60 * 1000);
}

function jitterMinutes(base: number, spread: number): number {
  return base + (faker.number.float({ min: -spread, max: spread }));
}

type SeedEvent = { type: SyncEventType; message: string; at: Date; metadata?: Record<string, unknown> };

async function main() {
  console.log("Resetting existing data...");
  await prisma.incidentReport.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.syncEvent.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pipelineCursor.deleteMany();

  // deleteMany() doesn't reset autoincrement sequences, so re-running this
  // script without a full `prisma migrate reset` would otherwise produce
  // different ids each time. Reset them so the seed is fully deterministic.
  for (const table of ["Order", "SyncEvent", "Incident", "IncidentReport", "PipelineCursor"]) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${table}_id_seq" RESTART WITH 1`);
  }

  const totalHealthy = 300;
  const failureSpikeStart = 150;
  const failureSpikeEnd = 157;

  // The poison order (sequence 301) lands ~3 days ago; the 300 healthy
  // orders before it must all have *earlier* placedAt timestamps than that,
  // since sequenceNumber is meant to track arrival order — otherwise #300
  // would appear to arrive after #301 despite the lower sequence number.
  const poisonPlacedAt = minutesAgo(3 * 24 * 60 + 40);
  const spanMinutes = 20 * 24 * 60;
  const stepMinutes = spanMinutes / totalHealthy;

  console.log(`Seeding ${totalHealthy} healthy historical orders...`);
  for (let seq = 1; seq <= totalHealthy; seq++) {
    const placedAt = new Date(
      poisonPlacedAt.getTime() - (spanMinutes - seq * stepMinutes) * 60_000 + faker.number.float({ min: -5 * 60_000, max: 5 * 60_000 })
    );
    const inFailureSpike = seq >= failureSpikeStart && seq <= failureSpikeEnd;

    const discoveredAt = placedAt;
    const events: SeedEvent[] = [
      { type: "DISCOVERED", message: "Order discovered from sourcing API", at: discoveredAt },
    ];

    let attemptCount = 1;
    let syncedAt: Date;
    let lastError: string | null = null;

    if (inFailureSpike) {
      // Third-party API returned 429s for ~45 minutes before the batch drained.
      const failures = faker.number.int({ min: 2, max: 3 });
      let cursor = discoveredAt.getTime() + 2 * 60_000;
      for (let f = 0; f < failures; f++) {
        events.push({
          type: "SYNC_FAILURE",
          message: "Sourcing API responded 429 Too Many Requests",
          at: new Date(cursor),
          metadata: { httpStatus: 429, retryAfterSeconds: 300 },
        });
        cursor += faker.number.int({ min: 12, max: 20 }) * 60_000;
        attemptCount++;
      }
      events.push({ type: "SYNC_ATTEMPT", message: "Retrying sync after backoff", at: new Date(cursor) });
      cursor += 60_000;
      events.push({ type: "SYNC_SUCCESS", message: "Order synced into local database", at: new Date(cursor) });
      cursor += 5 * 60_000;
      events.push({ type: "SETTLEMENT_CHECK", message: "Checking settlement status with payments provider", at: new Date(cursor) });
      cursor += 3 * 60_000;
      events.push({ type: "SETTLEMENT_CONFIRMED", message: "Settlement confirmed", at: new Date(cursor) });
      syncedAt = new Date(cursor);
      lastError = null;
    } else {
      let cursor = discoveredAt.getTime() + faker.number.int({ min: 1, max: 3 }) * 60_000;
      events.push({ type: "SYNC_ATTEMPT", message: "Attempting sync", at: new Date(cursor) });
      cursor += faker.number.int({ min: 1, max: 4 }) * 60_000;
      events.push({ type: "SYNC_SUCCESS", message: "Order synced into local database", at: new Date(cursor) });
      cursor += faker.number.int({ min: 2, max: 10 }) * 60_000;
      events.push({ type: "SETTLEMENT_CHECK", message: "Checking settlement status with payments provider", at: new Date(cursor) });
      cursor += faker.number.int({ min: 1, max: 5 }) * 60_000;
      events.push({ type: "SETTLEMENT_CONFIRMED", message: "Settlement confirmed", at: new Date(cursor) });
      syncedAt = new Date(cursor);
    }

    const settledAt = syncedAt;

    await prisma.order.create({
      data: {
        externalId: `ext_${faker.string.alphanumeric(12)}`,
        sequenceNumber: seq,
        status: OrderStatus.SYNCED,
        customerEmail: faker.internet.email().toLowerCase(),
        amountCents: faker.number.int({ min: 1999, max: 89999 }),
        currency: "USD",
        placedAt,
        discoveredAt,
        syncedAt,
        settledAt,
        lastAttemptAt: events[events.length - 1].at,
        attemptCount,
        lastError,
        events: {
          create: events.map((e) => ({
            type: e.type,
            message: e.message,
            metadata: e.metadata ?? undefined,
            createdAt: e.at,
          })),
        },
      },
    });
  }

  console.log("Seeding the poison order (301, AWAITING_SETTLEMENT, currency=MXN)...");
  const poisonSeq = totalHealthy + 1;
  const poisonEvents: SeedEvent[] = [
    { type: "DISCOVERED", message: "Order discovered from sourcing API", at: poisonPlacedAt, metadata: { currency: "MXN", amount: "18500.00" } },
    { type: "SYNC_ATTEMPT", message: "Attempting sync", at: new Date(poisonPlacedAt.getTime() + 2 * 60_000) },
    { type: "SYNC_SUCCESS", message: "Order synced into local database", at: new Date(poisonPlacedAt.getTime() + 5 * 60_000) },
    { type: "SETTLEMENT_CHECK", message: "Checking settlement status with payments provider", at: new Date(poisonPlacedAt.getTime() + 8 * 60_000) },
  ];
  // Settlement retries, roughly every 8-14 hours for 3 days, none confirming.
  let retryCursor = poisonPlacedAt.getTime() + 8 * HOUR;
  let poisonAttemptCount = 3;
  while (retryCursor < now - 30 * 60_000) {
    poisonEvents.push({
      type: "SETTLEMENT_CHECK",
      message: "Re-checking settlement status; provider has not confirmed",
      at: new Date(retryCursor),
    });
    poisonAttemptCount++;
    retryCursor += faker.number.int({ min: 8, max: 14 }) * HOUR;
  }
  const poisonLastAttempt = poisonEvents[poisonEvents.length - 1].at;

  await prisma.order.create({
    data: {
      externalId: `ext_${faker.string.alphanumeric(12)}`,
      sequenceNumber: poisonSeq,
      status: OrderStatus.AWAITING_SETTLEMENT,
      customerEmail: faker.internet.email().toLowerCase(),
      amountCents: 1850000,
      currency: "MXN",
      placedAt: poisonPlacedAt,
      discoveredAt: poisonPlacedAt,
      syncedAt: new Date(poisonPlacedAt.getTime() + 5 * 60_000),
      settledAt: null,
      lastAttemptAt: poisonLastAttempt,
      attemptCount: poisonAttemptCount,
      lastError: "Settlement not confirmed after repeated checks: no webhook received from payments provider for this order",
      events: {
        create: poisonEvents.map((e) => ({
          type: e.type,
          message: e.message,
          metadata: e.metadata ?? undefined,
          createdAt: e.at,
        })),
      },
    },
  });

  console.log("Seeding the 50-order backlog blocked behind it (302..351)...");
  const backlogSize = 50;
  const backlogSpanMinutes = 3 * 24 * 60 - 40; // discovery continued right up to ~now
  const backlogStep = backlogSpanMinutes / backlogSize;
  for (let i = 0; i < backlogSize; i++) {
    const seq = poisonSeq + 1 + i;
    const discoveredAt = new Date(poisonPlacedAt.getTime() + (i + 1) * backlogStep * 60_000 + faker.number.float({ min: -5, max: 5 }) * 60_000);
    await prisma.order.create({
      data: {
        externalId: `ext_${faker.string.alphanumeric(12)}`,
        sequenceNumber: seq,
        status: OrderStatus.DISCOVERED,
        customerEmail: faker.internet.email().toLowerCase(),
        amountCents: faker.number.int({ min: 1999, max: 89999 }),
        currency: "USD",
        placedAt: discoveredAt,
        discoveredAt,
        syncedAt: null,
        settledAt: null,
        lastAttemptAt: null,
        attemptCount: 0,
        lastError: null,
        events: {
          create: [{ type: "DISCOVERED", message: "Order discovered from sourcing API", createdAt: discoveredAt }],
        },
      },
    });
  }

  console.log("Setting pipeline cursor to 300 (stuck behind the poison order)...");
  await prisma.pipelineCursor.create({
    data: { name: "order-sync", lastProcessedSequenceNumber: totalHealthy },
  });

  console.log("Seeding a historical, already-resolved incident for the failure spike...");
  const spikeOrders = await prisma.order.findMany({
    where: { sequenceNumber: { gte: failureSpikeStart, lte: failureSpikeEnd } },
    select: { id: true, sequenceNumber: true },
    orderBy: { sequenceNumber: "asc" },
  });
  const spikeBaseTime = poisonPlacedAt.getTime() - (spanMinutes - failureSpikeStart * stepMinutes) * 60_000;
  const spikeDetectedAt = new Date(spikeBaseTime + 50 * 60_000);
  const spikeResolvedAt = new Date(spikeDetectedAt.getTime() + 55 * 60_000);
  const historicalIncident = await prisma.incident.create({
    data: {
      type: IncidentType.SYNC_FAILURE_SPIKE,
      severity: Severity.LOW,
      status: IncidentStatus.RESOLVED,
      title: "Burst of sync failures (orders #150-#157)",
      summary: `${spikeOrders.length} orders each logged 2-3 consecutive SYNC_FAILURE events within a ~45 minute window before succeeding on retry.`,
      relatedOrderIds: spikeOrders.map((o) => o.id),
      detectedAt: spikeDetectedAt,
      resolvedAt: spikeResolvedAt,
    },
  });
  await prisma.incidentReport.create({
    data: {
      incidentId: historicalIncident.id,
      status: ReportStatus.SUCCESS,
      model: "claude-sonnet-5 (backfilled)",
      rootCause:
        "The sourcing API rate-limited this batch with HTTP 429 responses for roughly 45 minutes. Every affected order retried on its existing exponential backoff and succeeded on the next attempt — no orders were lost and none required manual intervention.",
      confidence: "high",
      affectedOrderIds: spikeOrders.map((o) => o.id),
      evidenceTrail: [
        { step: 1, finding: "Checked orders currently in FAILED status: none found, so this wasn't an unresolved hard failure." },
        {
          step: 2,
          finding: `Searched recent SYNC_FAILURE events and found ${spikeOrders.length} orders with failures clustered in a single ~45 minute window ~9 days ago.`,
        },
        {
          step: 3,
          finding: `Pulled the full sync history for order #${spikeOrders[0]?.sequenceNumber}: SYNC_FAILURE (429) -> SYNC_FAILURE (429) -> SYNC_ATTEMPT -> SYNC_SUCCESS, all within that same window.`,
        },
      ],
      recommendedActions: [
        "No action required — self-resolved via existing retry/backoff logic.",
        "Optional: lower the sourcing API polling concurrency during known high-traffic windows to reduce 429 frequency.",
      ],
    },
  });

  console.log("Seed complete.");
  console.log(`  Healthy orders: 1-${totalHealthy}`);
  console.log(`  Poison order:   #${poisonSeq} (AWAITING_SETTLEMENT, currency=MXN, stuck ~3 days)`);
  console.log(`  Backlog:        #${poisonSeq + 1}-#${poisonSeq + backlogSize} (DISCOVERED, never synced)`);
  console.log(`  Cursor:         order-sync @ ${totalHealthy}`);
  console.log("  The live scanner should flag this shortly after apps/server starts.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
