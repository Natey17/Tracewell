import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({
      apiKey: config.anthropicApiKey,
      // Some API keys are identity-linked (span multiple workspaces) and are
      // rejected with a 400 unless the target workspace is named explicitly.
      defaultHeaders: config.anthropicWorkspaceId
        ? { "anthropic-workspace-id": config.anthropicWorkspaceId }
        : undefined,
    });
  }
  return client;
}
