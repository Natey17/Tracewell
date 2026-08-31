import { config } from "./config";
import { createApp } from "./app";
import { startScanner } from "./scanner";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Tracewell server listening on :${config.port}`);
  if (!config.anthropicApiKey) {
    console.warn("ANTHROPIC_API_KEY is not set — anomalies will be detected but not investigated.");
  }
  startScanner();
});
