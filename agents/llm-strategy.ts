/**
 * A model-driven negotiator.
 *
 * The agent is a Claude loop with the JANG MCP server attached. It is given its
 * own persona and nothing about the counterparty; everything it learns about
 * the other side, it learns from the offers it receives. The tools it calls are
 * the same ones the deterministic agent calls, against the same server.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Role } from "../src/lib/jang/types.ts";

const SERVER_PATH = fileURLToPath(new URL("../mcp/server.ts", import.meta.url));

export type LlmEvent =
  | { kind: "thinking"; label: string; text: string }
  | { kind: "tool"; label: string; tool: string; input: unknown }
  | { kind: "result"; label: string; text: string };

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** The SDK's API-equivalent cost estimate, reported even when run on a subscription. */
  costUsd: number;
  durationMs: number;
};

export type LlmRunResult = { label: string; turns: number; toolCalls: number; usage?: LlmUsage; error?: string };

export async function runLlmAgent(input: {
  role: Role;
  persona: string;
  apiUrl: string;
  apiKey: string;
  sessionId: string;
  model?: string;
  maxTurns?: number;
  /** Extra environment for the agent's MCP server, e.g. { JANG_MESO: "off" }. */
  env?: Record<string, string>;
  onEvent?: (event: LlmEvent) => void;
}): Promise<LlmRunResult> {
  const label = input.role;
  const promptPath = fileURLToPath(new URL(`./prompts/${input.role}.md`, import.meta.url));
  const systemPrompt = readFileSync(promptPath, "utf8").replace("{{PERSONA}}", input.persona);

  let turns = 0;
  let toolCalls = 0;

  const response = query({
    prompt:
      "Begin. Call get_session to see where the negotiation stands, then take your turn. " +
      "Keep going until the session is agreed or closed, then say what you agreed and stop.",
    options: {
      systemPrompt,
      model: input.model ?? "claude-sonnet-5-5",
      maxTurns: input.maxTurns ?? 40,
      permissionMode: "bypassPermissions",
      allowedTools: ["mcp__jang__get_session", "mcp__jang__offer", "mcp__jang__counter", "mcp__jang__accept"],
      mcpServers: {
        jang: {
          type: "stdio",
          command: "npx",
          args: ["tsx", SERVER_PATH],
          env: {
            ...(process.env as Record<string, string>),
            JANG_API_URL: input.apiUrl,
            JANG_AGENT_KEY: input.apiKey,
            JANG_SESSION_ID: input.sessionId,
            ...input.env,
          },
        },
      },
    },
  });

  let usage: LlmUsage | undefined;
  let error: string | undefined;
  try {
    for await (const message of response) {
      if (message.type === "result") {
        const u = (message as any).usage ?? {};
        usage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          costUsd: (message as any).total_cost_usd ?? 0,
          durationMs: (message as any).duration_ms ?? 0,
        };
        continue;
      }
      if (message.type !== "assistant") continue;
      turns += 1;
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          input.onEvent?.({ kind: "thinking", label, text: block.text.trim() });
        } else if (block.type === "tool_use") {
          toolCalls += 1;
          input.onEvent?.({ kind: "tool", label, tool: block.name.replace("mcp__jang__", ""), input: block.input });
        }
      }
    }

  } catch (e) {
    // The SDK throws after its result message when a run ends in error (for
    // example the turn limit). Keep what was measured instead of losing it.
    error = String(e);
  }

  return { label, turns, toolCalls, usage, error };
}
