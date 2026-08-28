import { config } from "../config";
import { detectStuckOrders } from "./detectors/stuckOrders";
import { detectBlockedBacklog } from "./detectors/blockedBacklog";
import { detectSyncFailureSpike } from "./detectors/syncFailureSpike";
import { detectDataFlowGaps } from "./detectors/dataFlowGaps";
import { createIncidentIfNew, autoResolveStaleIncidents } from "../services/incidents";
import { runInvestigation } from "../agent";

let scanning = false;

export async function runScanCycle(): Promise<void> {
  if (scanning) {
    console.log("[scanner] previous cycle still running, skipping this tick");
    return;
  }
  scanning = true;
  try {
    await autoResolveStaleIncidents();

    const anomalies = [
      ...(await detectStuckOrders(config.stuckOrderThresholdMinutes)),
      ...(await detectBlockedBacklog()),
      ...(await detectSyncFailureSpike()),
      ...(await detectDataFlowGaps(config.dataFlowGapThresholdMinutes)),
    ];

    for (const anomaly of anomalies) {
      const incident = await createIncidentIfNew(anomaly);
      if (!incident) continue;

      console.log(`[scanner] new incident #${incident.id}: ${incident.title}`);

      if (!config.anthropicApiKey) {
        console.warn(`[scanner] ANTHROPIC_API_KEY not set, skipping automatic investigation of incident #${incident.id}`);
        continue;
      }

      runInvestigation(incident.id).catch((err) => {
        console.error(`[scanner] investigation of incident #${incident.id} failed:`, err);
      });
    }
  } catch (err) {
    console.error("[scanner] scan cycle failed:", err);
  } finally {
    scanning = false;
  }
}

export function startScanner(): NodeJS.Timeout {
  console.log(`[scanner] starting, interval ${config.scannerIntervalSeconds}s`);
  void runScanCycle();
  return setInterval(() => void runScanCycle(), config.scannerIntervalSeconds * 1000);
}
