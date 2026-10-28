/**
 * An agent's connection to JANG.
 *
 * Every move an agent makes goes through a real MCP tool call over stdio to its
 * own instance of the JANG MCP server, carrying its own key. Deterministic and
 * model-driven agents both go through this, so the interface under test is the
 * same one either way.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Agreement, Terms } from "../src/lib/jang/types.ts";

const SERVER_PATH = fileURLToPath(new URL("../mcp/server.ts", import.meta.url));

export type ToolCallLog = {
  tool: string;
  args: unknown;
  isError: boolean;
  summary: string;
};

export class McpAgent {
  private client?: Client;
  readonly calls: ToolCallLog[] = [];

  constructor(
    readonly label: string,
    private readonly env: { apiUrl: string; apiKey: string; sessionId: string },
    private readonly onCall?: (log: ToolCallLog) => void,
  ) {}

  async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", SERVER_PATH],
      env: {
        ...(process.env as Record<string, string>),
        JANG_API_URL: this.env.apiUrl,
        JANG_AGENT_KEY: this.env.apiKey,
        JANG_SESSION_ID: this.env.sessionId,
      },
      stderr: "ignore",
    });
    this.client = new Client({ name: `jang-agent-${this.label}`, version: "0.1.0" });
    await this.client.connect(transport);
  }

  async close(): Promise<void> {
    await this.client?.close();
  }

  async listTools(): Promise<string[]> {
    const result = await this.must().listTools();
    return result.tools.map((tool) => tool.name);
  }

  async getSession(): Promise<SessionView> {
    return this.call<SessionView>("get_session", {});
  }

  async offer(terms: Terms, note: string): Promise<SessionView> {
    return this.call<SessionView>("offer", { terms, note });
  }

  async accept(): Promise<{ agreement: Agreement; session: SessionView }> {
    return this.call<{ agreement: Agreement; session: SessionView }>("accept", {});
  }

  /** Raw tool call, for the misuse test, which needs to see the refusal itself. */
  async callRaw(tool: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
    const result = (await this.must().callTool({ name: tool, arguments: args })) as {
      content: { type: string; text?: string }[];
      isError?: boolean;
    };
    const text = result.content.map((part) => part.text ?? "").join("\n");
    const log = { tool, args, isError: Boolean(result.isError), summary: text.split("\n\n")[0] };
    this.calls.push(log);
    this.onCall?.(log);
    return { isError: Boolean(result.isError), text };
  }

  private async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const { isError, text } = await this.callRaw(tool, args);
    if (isError) throw new McpToolError(tool, text);
    const start = text.indexOf("\n\n");
    if (start === -1) throw new McpToolError(tool, `no payload in response: ${text}`);
    return JSON.parse(text.slice(start + 2)) as T;
  }

  private must(): Client {
    if (!this.client) throw new Error(`agent ${this.label} is not connected`);
    return this.client;
  }
}

export class McpToolError extends Error {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
  get code(): string {
    return this.message.split(":")[0] ?? "ERROR";
  }
}
