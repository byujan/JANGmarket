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
import type { Terms } from "../src/lib/jang/types.ts";
import { ItemSpecSchema } from "../src/lib/jang/types.ts";
import { packagesOf } from "../src/lib/jang/session.ts";
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

/** Opt-in nudges towards MESO (turn reminder, which package their counter was closest to). */
const MESO_GUIDE = process.env.JANG_MESO !== "off" && process.env.JANG_MESO_GUIDE === "on";

/**
 * Which of our own last packages the counterparty's counter came closest to,
 * when our last offer carried alternatives. Distance is per term, scaled by
 * the term's range, so no term dominates by its units. Uses only offers both
 * sides have already seen.
 */
function closestOfOurs(view: SessionView): { index: number; count: number; terms: Terms } | undefined {
  const standing = view.standingOffer;
  if (!standing || standing.fromAgentId === view.you.agentId) return undefined;
  const ours = view.offers.filter((o) => o.fromAgentId === view.you.agentId && o.round < standing.round).at(-1);
  if (!ours?.alternatives?.length) return undefined;
  const packages = packagesOf(ours);
  const distance = (terms: Terms) =>
    view.itemSpec.dimensions.reduce((sum, d) => sum + Math.abs((terms[d.key] ?? 0) - (standing.terms[d.key] ?? 0)) / (d.max - d.min || 1), 0);
  let index = 0;
  packages.forEach((pkg, i) => {
    if (distance(pkg.terms) < distance(packages[index].terms)) index = i;
  });
  return { index, count: packages.length, terms: packages[index].terms };
}

/** What the agent is told after every move, in words it can reason over. */
function describe(view: SessionView): string {
  const standing = view.standingOffer;
  const lines = [
    `Session ${view.sessionId} is ${view.status}. You are the ${view.you.role}; the ${view.counterparty.role} is ${view.counterparty.agentId}.`,
    `Round ${view.roundsUsed} of at most ${view.maxRounds}.`,
  ];
  if (view.counterpartyPriorities?.length) {
    lines.push(
      `The ${view.counterparty.role} has shared what matters most to them, most important first: ${view.counterpartyPriorities.join(" > ")}. Give ground on what they rank high and hold firm on what they rank low.`,
    );
  }
  if (standing) {
    const mine = standing.fromAgentId === view.you.agentId;
    const show = (terms: Terms) =>
      Object.entries(terms)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
    const packages = packagesOf(standing);
    if (packages.length === 1) {
      lines.push(
        `${mine ? "Your" : "Their"} standing offer (round ${standing.round}): ${show(standing.terms)}` +
          (standing.note ? ` ("${standing.note}")` : ""),
      );
      lines.push(`It is worth ${utility(standing.terms, view.yourMandate).toFixed(3)} to you (your reservation is ${view.yourMandate.reservationUtility}).`);
    } else {
      lines.push(
        `${mine ? "Your" : "Their"} standing offer (round ${standing.round}) has ${packages.length} packages` +
          (standing.note ? ` ("${standing.note}")` : "") +
          (mine ? ":" : "; to accept one, pass its offerId to accept:"),
      );
      for (const pkg of packages) {
        lines.push(`- ${pkg.offerId}: ${show(pkg.terms)} (worth ${utility(pkg.terms, view.yourMandate).toFixed(3)} to you)`);
      }
      lines.push(`Your reservation is ${view.yourMandate.reservationUtility}.`);
    }
  } else {
    lines.push("No offer has been made yet.");
  }
  const closest = MESO_GUIDE ? closestOfOurs(view) : undefined;
  if (closest) {
    lines.push(
      `Your last offer had ${closest.count} packages; their counter came closest to ${closest.index === 0 ? "your main package" : `your alternative ${closest.index}`} (${Object.entries(closest.terms)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}). That is a hint about what they value.`,
    );
  }
  if (view.market && (view.market.openSessions > 1 || view.market.remaining <= 1)) {
    const rivals = Math.max(0, view.market.openSessions - 1);
    lines.push(
      `You may still commit to ${view.market.remaining} of the ${view.market.authorised} your owner authorised` +
        (rivals > 0
          ? `, and ${rivals} other ${rivals === 1 ? "negotiation is" : "negotiations are"} running for the same item.`
          : "."),
    );
  }

  lines.push(
    view.status !== "open"
      ? "This session is closed."
      : view.whoseTurn === "either"
        ? "Either side may open."
        : view.whoseTurn === view.you.agentId
          ? MESO_GUIDE
            ? "It is your turn. You may attach up to two alternatives to your counter: packages worth about the same to you, built differently."
            : "It is your turn."
          : "It is the counterparty's turn; wait for them.",
  );
  return lines.join("\n");
}

const server = new McpServer({ name: "jang", version: "0.1.0" });

server.registerTool(
  "list_items",
  {
    title: "See what is on the market",
    description:
      "List everything this JANG instance has to negotiate over: the markets it ships with and the items owners " +
      "have listed. Each entry says which side is yours to take, whether your owner has already given you a " +
      "mandate for it, and what the negotiable terms are. Start here when you have not been told what to bargain over.",
    inputSchema: {},
  },
  async () => {
    try {
      const { items } = await client.market();
      const open = items.filter((item) => item.yourRole);
      const lines = items.map(
        (item) =>
          `- ${item.itemId}: ${item.title}` +
          (item.yourRole
            ? ` — you would ${item.yourRole === "buyer" ? "buy" : "sell"}` +
              (item.youHaveMandate ? ", and you already hold a mandate" : ", but you hold no mandate for it yet")
            : " — not open to you"),
      );
      return ok(
        `${items.length} items, ${open.length} open to you. Call describe_item for the full terms and the ` +
          `counterparty to open a session against.\n${lines.join("\n")}`,
        items,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "describe_item",
  {
    title: "Look at one item in full",
    description:
      "Everything needed to start negotiating over an item: its full specification, which side is yours, whether " +
      "you hold a mandate for it, and the counterparty agent id to name when you call open_session. The itemSpec " +
      "it returns is the one to pass straight to open_session.",
    inputSchema: { itemId: z.string().describe("As listed by list_items.") },
  },
  async ({ itemId }) => {
    try {
      const item = await client.marketItem(itemId);
      return ok(
        `${item.title}. ${item.yourRole ? `You would ${item.yourRole === "buyer" ? "buy" : "sell"}.` : "Not open to you."}` +
          `\n\nNext:\n${item.nextSteps.map((step) => `- ${step}`).join("\n")}`,
        item,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

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
    description:
      "Start a negotiation with a counterparty over an item. Both agents must have lodged a mandate for the item " +
      "first. Use describe_item to get the itemSpec and the counterparty id. Opened against a house agent, the " +
      "house begins bargaining back on its own, so take your turn and then poll get_session.",
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

// JANG_MESO=off hides the alternatives field, so experiments can compare
// Claude agents with and without MESO. Unset, the tool offers it as always.
const fullOfferInput = {
  terms: z.record(z.string(), z.number()).describe("One value for every dimension of the item, for example { price: 1320, deliveryDays: 21, warrantyMonths: 24, bundle: 0 }."),
  alternatives: z
    .array(z.record(z.string(), z.number()))
    .max(2)
    .optional()
    .describe(
      "Optional: up to two more complete packages that are worth about the same to you. The counterparty picks one, which tells you what they value without costing you anything.",
    ),
  note: z.string().max(500).optional().describe("A short message to the counterparty. Never reveal your own limits here."),
  sessionId: z.string().optional(),
};
const { alternatives: _alternatives, ...offerInputWithoutMeso } = fullOfferInput;
const offerInput = (process.env.JANG_MESO === "off" ? offerInputWithoutMeso : fullOfferInput) as typeof fullOfferInput;

async function placeOffer({
  terms,
  alternatives,
  note,
  sessionId,
}: {
  terms: Record<string, number>;
  alternatives?: Record<string, number>[];
  note?: string;
  sessionId?: string;
}) {
  try {
    const view = await client.offer(resolveSession(sessionId), terms, note, alternatives);
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
      "Accept the counterparty's standing offer. If it offers several packages, name the one you accept by its offerId. JANG re-checks it against your mandate and, if it holds, issues an agreement signed with JANG's key.",
    inputSchema: {
      offerId: z.string().optional().describe("Required when the standing offer has more than one package."),
      sessionId: z.string().optional(),
    },
  },
  async ({ offerId, sessionId }) => {
    try {
      const { session, agreement } = await client.accept(resolveSession(sessionId), offerId);
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
