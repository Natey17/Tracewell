import { defineConfig } from "vitest/config";

// Not imported from test/testDbUrl.ts so the native config loader doesn't
// have to cross a CJS/ESM boundary to read it; global-setup.ts and
// setup-env.ts import the shared constant as usual. Same env override
// (falls back to the local docker-compose Postgres on port 5433) so CI can
// point this at its own Postgres service container.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://tracewell:tracewell@localhost:5433/tracewell_test?schema=public";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    globalSetup: "./test/global-setup.ts",
    setupFiles: ["./test/setup-env.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
    },
    // Detector/service/route tests share one Postgres connection and truncate
    // tables between cases — running them concurrently would race.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.d.ts"],
    },
  },
});
