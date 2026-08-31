import "./setup-env";
import { getPrismaClient, OrderStatus, type Order } from "@tracewell/db";

const prisma = getPrismaClient();

/** Wipes every table between tests so fixtures never leak across cases. */
export async function resetDb(): Promise<void> {
  await prisma.incidentReport.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.syncEvent.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pipelineCursor.deleteMany();
}

let sequenceCounter = 0;

/** Builds a plausible order fixture, sequence numbers auto-incrementing across a test file. */
export async function createOrder(overrides: Partial<Parameters<typeof prisma.order.create>[0]["data"]> = {}): Promise<Order> {
  sequenceCounter += 1;
  const now = new Date();
  return prisma.order.create({
    data: {
      externalId: `ext_test_${sequenceCounter}`,
      sequenceNumber: sequenceCounter,
      status: OrderStatus.SYNCED,
      customerEmail: `test${sequenceCounter}@example.com`,
      amountCents: 1000,
      currency: "USD",
      placedAt: now,
      discoveredAt: now,
      syncedAt: now,
      settledAt: now,
      ...overrides,
    },
  });
}

export function resetSequenceCounter(): void {
  sequenceCounter = 0;
}

export { prisma as testPrisma };
