#!/usr/bin/env tsx
/**
 * The JANG MCP server: the front door an autonomous agent uses to negotiate.
 *
 * It is a thin client of the JANG REST API, so the API stays the product and
 * MCP is one door onto it. One identity per process: the agent's key and its
 * session come from the environment, which means this same binary serves the
 * buyer and the seller without either being able to act as the other.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JangApiError, JangClient } from "../src/lib/client.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import { ItemSpecSchema } from "../src/lib/jang/types.ts";
import { utility } from "../src/lib/jang/utility.ts";

const BASE_URL = process.env.JANG_API_URL ?? "http://localhost:3939";
const AGENT_KEY = process.env.JANG_AGENT_KEY;
const DEFAULT_SESSION = process.env.JANG_SESSION_ID;

if (!AGENT_KEY) {
  console.error("JANG_AGENT_KEY is required: this server acts as exactly one agent.");
  process.exit(1);
}

const client = new JangClient(BASE_URL, AGENT_KEY);

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
};

function ok(summary: string, data: unknown): ToolResult {
  return { content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }] };
}

/**
 * A refusal is a result, not a crash: an agent that proposed something outside
 * its authority needs to read why and try a different package.
 */
function fail(error: unknown): ToolResult {
  if (error instanceof JangApiError) {
    const detail = error.violations?.length
      ? `\n\nWhy:\n${error.violations
          .map((v) => `- ${v.dimension}: ${v.reason}${v.limit !== undefined ? ` (limit ${v.limit}, offered ${v.offered})` : ""}`)
          .join("\n")}`
      : "";
    return {
      content: [{ type: "text", text: `${error.code}: ${error.message}${detail}` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: `ERROR: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
}

function resolveSession(sessionId?: string): string {
  const id = sessionId ?? DEFAULT_SESSION;
  if (!id) throw new JangApiError("NOT_FOUND", "no sessionId given and JANG_SESSION_ID is not set");
  return id;
}

/** What the agent is told after every move, in words it can reason over. */
function describe(view: SessionView): string {
  const standing = view.standingOffer;
  const lines = [
    `Session ${view.sessionId} is ${view.status}. You are the ${view.you.role}; the ${view.counterparty.role} is ${view.counterparty.agentId}.`,
    `Round ${view.roundsUsed} of at most ${view.maxRounds}.`,
  ];
  if (standing) {
    const mine = standing.fromAgentId === view.you.agentId;
    const terms = Object.entries(standing.terms)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    lines.push(
      `${mine ? "Your" : "Their"} standing offer (round ${standing.round}): ${terms}` +
        (standing.note ? ` — "${standing.note}"` : ""),
    );
    lines.push(`It is worth ${utility(standing.terms, view.yourMandate).toFixed(3)} to you (your reservation is ${view.yourMandate.reservationUtility}).`);
  } else {
    lines.push("No offer has been made yet.");
  }
  lines.push(
    view.status !== "open"
      ? "This session is closed."
      : view.whoseTurn === "either"
        ? "Either side may open."
        : view.whoseTurn === view.you.agentId
          ? "It is your turn."
          : "It is the counterparty's turn; wait for them.",
  );
  return lines.join("\n");
}

const server = new McpServer({ name: "jang", version: "0.1.0" });

server.registerTool(
  "get_session",
  {
    title: "Get the negotiation session",
    description:
      "Read the current state of a negotiation: the item and its negotiable dimensions, your own mandate, every offer so far, and whose turn it is. You never see the counterparty's mandate.",
    inputSchema: { sessionId: z.string().optional().describe("Defaults to this agent's configured session.") },
  },
  async ({ sessionId }) => {
    try {
      const view = await client.getSession(resolveSession(sessionId));
      return ok(describe(view), view);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "open_session",
  {
    title: "Open a negotiation session",
    description: "Start a negotiation with a counterparty over an item. Both agents must have lodged a mandate for the item first.",
    inputSchema: {
      counterpartyAgentId: z.string(),
      itemSpec: ItemSpecSchema,
      maxRounds: z.number().int().positive().max(100).optional(),
    },
  },
  async (args) => {
    try {
      const view = await client.openSession(args);
      return ok(describe(view), view);
    } catch (error) {
      return fail(error);
    }
  },
);

const offerInput = {
  terms: z.record(z.number()).describe("One value for every dimension of the item, for example { price: 1320, deliveryDays: 21, warrantyMonths: 24, bundle: 0 }."),
  note: z.string().max(500).optional().describe("A short message to the counterparty. Never reveal your own limits here."),
  sessionId: z.string().optional(),
};

async function placeOffer({ terms, note, sessionId }: { terms: Record<string, number>; note?: string; sessionId?: string }) {
  try {
    const view = await client.offer(resolveSession(sessionId), terms, note);
    return ok(describe(view), view);
  } catch (error) {
    return fail(error);
  }
}

server.registerTool(
  "offer",
  {
    title: "Make an offer",
    description:
      "Propose a complete package of terms. JANG refuses any package outside the authority your owner signed, because proposing it would bind them.",
    inputSchema: offerInput,
  },
  placeOffer,
);

server.registerTool(
  "counter",
  {
    title: "Counter the standing offer",
    description: "Reply to the counterparty's standing offer with a package of your own. Identical to `offer`; use whichever reads more naturally.",
    inputSchema: offerInput,
  },
  placeOffer,
);

server.registerTool(
  "accept",
  {
    title: "Accept the standing offer",
    description:
      "Accept the counterparty's standing offer. JANG re-checks it against your mandate and, if it holds, issues an agreement signed with JANG's key.",
    inputSchema: { sessionId: z.string().optional() },
  },
  async ({ sessionId }) => {
    try {
      const { session, agreement } = await client.accept(resolveSession(sessionId));
      return ok(
        `Deal closed in ${agreement.rounds} rounds. JANG signed agreement ${agreement.agreementId}. ` +
          `Verify the signature against JANG's public key and re-check the terms against your own mandate before you pay.`,
        { agreement, session },
      );
    } catch (error) {
      return fail(error);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`[jang-mcp] ready against ${BASE_URL}${DEFAULT_SESSION ? ` for session ${DEFAULT_SESSION}` : ""}`);
