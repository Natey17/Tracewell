import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}
