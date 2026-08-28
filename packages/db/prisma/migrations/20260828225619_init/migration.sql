-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DISCOVERED', 'SYNCING', 'AWAITING_SETTLEMENT', 'SETTLED', 'SYNCED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncEventType" AS ENUM ('DISCOVERED', 'SYNC_ATTEMPT', 'SYNC_SUCCESS', 'SYNC_FAILURE', 'SETTLEMENT_CHECK', 'SETTLEMENT_CONFIRMED', 'RETRY_SCHEDULED', 'BLOCKED_WAITING');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('STUCK_ORDER', 'BLOCKED_BACKLOG', 'SYNC_FAILURE_SPIKE', 'DATA_FLOW_GAP');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DISCOVERED',
    "customerEmail" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "placedAt" TIMESTAMP(3) NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "type" "SyncEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineCursor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lastProcessedSequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "relatedOrderIds" INTEGER[],
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" SERIAL NOT NULL,
    "incidentId" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUCCESS',
    "model" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "affectedOrderIds" INTEGER[],
    "evidenceTrail" JSONB NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "rawModelOutput" JSONB,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_externalId_key" ON "Order"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_sequenceNumber_key" ON "Order"("sequenceNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_placedAt_idx" ON "Order"("placedAt");

-- CreateIndex
CREATE INDEX "SyncEvent_orderId_idx" ON "SyncEvent"("orderId");

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineCursor_name_key" ON "PipelineCursor"("name");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");

-- CreateIndex
CREATE INDEX "IncidentReport_incidentId_idx" ON "IncidentReport"("incidentId");

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
