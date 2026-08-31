import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { ordersRouter } from "./routes/orders";
import { pipelineRouter } from "./routes/pipeline";
import { incidentsRouter } from "./routes/incidents";

/**
 * Express app wiring, split out from index.ts so tests can import it
 * directly (via supertest) without starting a real HTTP listener or the
 * scanner's setInterval loop.
 */
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/pipeline", pipelineRouter);
  app.use("/api/incidents", incidentsRouter);

  return app;
}
