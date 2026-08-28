import { IncidentType, Severity } from "@tracewell/db";

export interface DetectedAnomaly {
  type: IncidentType;
  severity: Severity;
  title: string;
  summary: string;
  relatedOrderIds: number[];
  /** Used to dedupe against already-open incidents of the same type. */
  dedupeKey: string;
}
