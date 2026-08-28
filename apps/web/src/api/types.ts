export type OrderStatus =
  | "DISCOVERED"
  | "SYNCING"
  | "AWAITING_SETTLEMENT"
  | "SETTLED"
  | "SYNCED"
  | "FAILED"
  | "CANCELLED";

export type SyncEventType =
  | "DISCOVERED"
  | "SYNC_ATTEMPT"
  | "SYNC_SUCCESS"
  | "SYNC_FAILURE"
  | "SETTLEMENT_CHECK"
  | "SETTLEMENT_CONFIRMED"
  | "RETRY_SCHEDULED"
  | "BLOCKED_WAITING";

export type IncidentType = "STUCK_ORDER" | "BLOCKED_BACKLOG" | "SYNC_FAILURE_SPIKE" | "DATA_FLOW_GAP";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "IGNORED";

export interface Order {
  id: number;
  externalId: string;
  sequenceNumber: number;
  status: OrderStatus;
  customerEmail: string;
  amountCents: number;
  currency: string;
  placedAt: string;
  discoveredAt: string;
  syncedAt: string | null;
  settledAt: string | null;
  lastAttemptAt: string | null;
  attemptCount: number;
  lastError: string | null;
  events?: SyncEvent[];
}

export interface SyncEvent {
  id: number;
  orderId: number;
  type: SyncEventType;
  message: string;
  metadata: unknown;
  createdAt: string;
  order?: { id: number; sequenceNumber: number; externalId: string };
}

export interface EvidenceStep {
  step: number;
  finding: string;
}

export interface IncidentReport {
  id: number;
  incidentId: number;
  status: "SUCCESS" | "FAILED";
  model: string;
  rootCause: string;
  confidence: string;
  affectedOrderIds: number[];
  evidenceTrail: EvidenceStep[];
  recommendedActions: string[];
  errorMessage: string | null;
  generatedAt: string;
}

export interface Incident {
  id: number;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  summary: string;
  relatedOrderIds: number[];
  detectedAt: string;
  resolvedAt: string | null;
  reports: IncidentReport[];
  relatedOrders?: Order[];
}

export interface PipelineStats {
  totalOrders: number;
  byStatus: Record<string, number>;
  cursor: { name: string; lastProcessedSequenceNumber: number } | null;
  backlogCount: number;
  oldestStuckOrder: { id: number; sequenceNumber: number; status: OrderStatus; stuckSince: string } | null;
  recentFailureCount: number;
  lastDiscoveredAt: string | null;
  dailySyncedCounts: { date: string; count: number }[];
}
