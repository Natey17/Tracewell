import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest doesn't expose `afterEach` as a real global unless test.globals is
// enabled, which Testing Library's auto-cleanup relies on — register it
// explicitly instead so the DOM is reset between tests in the same file.
afterEach(cleanup);
