import { execSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./testDbUrl";

const dbPackageDir = path.resolve(__dirname, "../../../packages/db");

/**
 * Vitest globalSetup: runs once before the whole suite, in its own process.
 * Creates the tracewell_test database if it doesn't exist yet, then pushes
 * the current Prisma schema into it. Idempotent — safe to run every time
 * `npm test` runs.
 */
export async function setup() {
  // Connect to the server's default maintenance database to issue CREATE
  // DATABASE — derived from TEST_DATABASE_URL rather than hardcoded, so
  // this also works against CI's Postgres service container.
  const testUrl = new URL(TEST_DATABASE_URL);
  const targetDb = testUrl.pathname.slice(1);
  const adminUrl = new URL(testUrl.toString());
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`[test setup] created ${targetDb} database`);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("already exists")) throw err;
  } finally {
    await admin.end();
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
