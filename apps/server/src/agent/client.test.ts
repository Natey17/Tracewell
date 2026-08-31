import { describe, it, expect, beforeEach, vi } from "vitest";

const AnthropicMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: AnthropicMock }));

describe("getAnthropicClient", () => {
  beforeEach(() => {
    vi.resetModules();
    AnthropicMock.mockClear();
  });

  it("throws a clear error when no API key is configured", async () => {
    vi.doMock("../config", () => ({ config: { anthropicApiKey: "", anthropicWorkspaceId: "" } }));
    const { getAnthropicClient } = await import("./client");

    expect(() => getAnthropicClient()).toThrow("ANTHROPIC_API_KEY is not set");
  });

  it("constructs the client with no workspace header when none is configured", async () => {
    vi.doMock("../config", () => ({ config: { anthropicApiKey: "sk-test", anthropicWorkspaceId: "" } }));
    const { getAnthropicClient } = await import("./client");

    getAnthropicClient();

    expect(AnthropicMock).toHaveBeenCalledWith({ apiKey: "sk-test", defaultHeaders: undefined });
  });

  it("adds the anthropic-workspace-id header for identity-linked keys", async () => {
    vi.doMock("../config", () => ({ config: { anthropicApiKey: "sk-test", anthropicWorkspaceId: "wrkspc_123" } }));
    const { getAnthropicClient } = await import("./client");

    getAnthropicClient();

    expect(AnthropicMock).toHaveBeenCalledWith({
      apiKey: "sk-test",
      defaultHeaders: { "anthropic-workspace-id": "wrkspc_123" },
    });
  });

  it("memoizes the client across calls instead of reconstructing it", async () => {
    vi.doMock("../config", () => ({ config: { anthropicApiKey: "sk-test", anthropicWorkspaceId: "" } }));
    const { getAnthropicClient } = await import("./client");

    const first = getAnthropicClient();
    const second = getAnthropicClient();

    expect(first).toBe(second);
    expect(AnthropicMock).toHaveBeenCalledTimes(1);
  });
});
