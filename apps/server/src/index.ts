import express from "express";
import cors from "cors";
import { config } from "./config";
import { healthRouter } from "./routes/health";
import { ordersRouter } from "./routes/orders";
import { pipelineRouter } from "./routes/pipeline";
import { incidentsRouter } from "./routes/incidents";
import { startScanner } from "./scanner";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/incidents", incidentsRouter);

app.listen(config.port, () => {
  console.log(`Tracewell server listening on :${config.port}`);
  if (!config.anthropicApiKey) {
    console.warn("ANTHROPIC_API_KEY is not set — anomalies will be detected but not investigated.");
  }
  startScanner();
});
