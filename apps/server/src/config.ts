import path from "node:path";
import dotenv from "dotenv";

// Workspaces run scripts with cwd = apps/server, but .env lives at the repo
// root — load it explicitly rather than relying on dotenv's cwd default.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: int("PORT", 4000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  scannerIntervalSeconds: int("SCANNER_INTERVAL_SECONDS", 30),
  stuckOrderThresholdMinutes: int("STUCK_ORDER_THRESHOLD_MINUTES", 60),
  dataFlowGapThresholdMinutes: int("DATA_FLOW_GAP_THRESHOLD_MINUTES", 120),
};
