/**
 * Tests run against a dedicated `tracewell_test` database — never against
 * the `tracewell` database the seed script and dashboard demo use, since
 * tests truncate tables between runs. Defaults to the local docker-compose
 * Postgres (port 5433); override via TEST_DATABASE_URL in CI, where the
 * Postgres service container is rarely on that same port.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://tracewell:tracewell@localhost:5433/tracewell_test?schema=public";
