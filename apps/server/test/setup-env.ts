import { TEST_DATABASE_URL } from "./testDbUrl";

// Runs before any test file's own imports. Several modules under test
// (services/*, agent/*) construct their Prisma client at module scope via
// getPrismaClient(), so DATABASE_URL must already point at the test
// database before those modules are ever imported.
process.env.DATABASE_URL = TEST_DATABASE_URL;
