import { Router } from "express";
import { getPipelineStats } from "../services/pipelineStats";
import { runScanCycle } from "../scanner";

export const pipelineRouter = Router();

pipelineRouter.get("/stats", async (_req, res) => {
  const stats = await getPipelineStats();
  res.json(stats);
});

pipelineRouter.post("/scan", async (_req, res) => {
  await runScanCycle();
  res.json({ triggered: true });
});
