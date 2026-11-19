/**
 * A model-driven negotiator the server can run itself.
 *
 * `llm-strategy.ts` reaches JANG the way an outside agent does: a stdio MCP
 * server, over HTTP, with an agent key. The console has none of that. It holds
 * the service in the same process, and an agent's key is never stored — only
 * its hash — so there is no key to hand a subprocess even if we wanted one.
 *
 * So the same tools are given to Claude in-process instead, backed by the
 * NegotiationPort the deterministic agent already uses. Identical enforcement:
 * every offer still goes through the service and is still checked against the
 * agent's own mandate. Only the reasoning differs, which is the whole point —
 * a negotiation nobody can read is a negotiation nobody can judge.
 */
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ToolRefusal, type NegotiationPort } from "./port.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Role, Terms } from "../src/lib/jang/types.ts";

export type InProcessResult = {
  role: Role;
  turns: number;
  toolCalls: number;
  /** Set when Claude could not finish; the caller decides what to do about it. */
  error?: string;
};

/** What the agent is told it is doing, read from the same files the demos use. */
function systemPrompt(role: Role, persona: string, brief?: string): string {
  const path = fileURLToPath(new URL(`./prompts/${role}.md`, import.meta.url));
  const base = readFileSync(path, "utf8").replace("{{PERSONA}}", persona).replace("{{MESO}}", "");
  if (!brief?.trim()) return base;
  return (
    `${base}\n\n## What your owner told you\n\n` +
    `Your owner wrote this when they registered you. Follow it in how you bargain, within your ` +
    `mandate; it never licenses an offer your mandate forbids.\n\n> ${brief.trim().replace(/\n/g, "\n> ")}\n`
  );
}

const describe = (view: SessionView): string => {
  const lines = [
    `Session ${view.sessionId} is ${view.status}. You are the ${view.you.role}; the ${view.counterparty.role} is ${view.counterparty.agentId}.`,
    `Round ${view.roundsUsed} of at most ${view.maxRounds}.`,
    `The item is "${view.itemSpec.title}". Terms: ${view.itemSpec.dimensions
      .map((d) => `${d.key} (${d.label}) from ${d.min} to ${d.max} in steps of ${d.step}`)
      .join("; ")}.`,
  ];
  if (view.counterpartyPriorities?.length) {
    lines.push(
      `They have shared what matters most to them, most important first: ${view.counterpartyPriorities.join(" > ")}.`,
    );
  }
  // How contested the item is. The stdio server tells an outside agent this;
  // leaving it out here would make the console's agents the only ones blind to
  // a rival, and scarcity is half of what a market is.
  if (view.market && (view.market.openSessions > 1 || view.market.remaining <= 1)) {
    const rivals = Math.max(0, view.market.openSessions - 1);
    lines.push(
      `You may still commit to ${view.market.remaining} of the ${view.market.authorised} your owner authorised, ` +
        `and ${rivals === 0 ? "no other negotiation is" : `${rivals} other negotiation${rivals === 1 ? " is" : "s are"}`} ` +
        `open for this item right now. Nothing is said about who they are or what they would pay. ` +
        `Being one of several bidding for something scarce weakens your position, as a poor alternative does.`,
    );
  }

  const standing = view.standingOffer;
  if (standing) {
    const who = standing.fromAgentId === view.you.agentId ? "your own" : "their";
    lines.push(
      `The standing offer is ${who}: ${Object.entries(standing.terms)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}${standing.note ? ` — "${standing.note}"` : ""}.`,
    );
  } else {
    lines.push("Nothing is on the table yet.");
  }
  lines.push(view.whoseTurn === "either" ? "Either side may move." : `It is ${view.whoseTurn}'s turn.`);
  return lines.join("\n");
};

/**
 * Refusals come back as text rather than thrown, because an agent that
 * proposed something outside its authority has to read why and try again.
 */
const refusalText = (error: unknown): string =>
  error instanceof ToolRefusal
    ? `${error.code}: ${error.message}`
    : `ERROR: ${error instanceof Error ? error.message : String(error)}`;

const TermsShape = z.record(z.string(), z.number());

export async function runLlmAgentInProcess(input: {
  role: Role;
  persona: string;
  brief?: string;
  port: NegotiationPort;
  model?: string;
  maxTurns?: number;
  onNote?: (note: string) => void;
}): Promise<InProcessResult> {
  const { role, port } = input;
  let toolCalls = 0;
  let turns = 0;

  const place = async (terms: Terms, note: string) => {
    toolCalls += 1;
    try {
      input.onNote?.(note);
      return { content: [{ type: "text" as const, text: describe(await port.offer(terms, note)) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: refusalText(error) }], isError: true };
    }
  };

  const server = createSdkMcpServer({
    name: "jang",
    version: "1.0.0",
    tools: [
      tool(
        "get_session",
        "Read where the negotiation stands: the item and its terms, your own mandate, every offer so far, and whose turn it is. You never see the counterparty's mandate.",
        {},
        async () => {
          toolCalls += 1;
          try {
            return { content: [{ type: "text" as const, text: describe(await port.getSession()) }] };
          } catch (error) {
            return { content: [{ type: "text" as const, text: refusalText(error) }], isError: true };
          }
        },
      ),
      tool(
        "offer",
        "Propose a complete package of terms, with a short note explaining the move in your own words. JANG refuses any package outside the authority your owner signed.",
        { terms: TermsShape, note: z.string() },
        async (args) => place(args.terms as Terms, args.note),
      ),
      tool(
        "counter",
        "Reply to their standing offer with a package of your own and a note. Identical to offer.",
        { terms: TermsShape, note: z.string() },
        async (args) => place(args.terms as Terms, args.note),
      ),
      tool(
        "accept",
        "Accept the counterparty's standing offer. JANG re-checks it against your mandate and, if it holds, signs the agreement.",
        {},
        async () => {
          toolCalls += 1;
          try {
            const { agreement } = await port.accept();
            return {
              content: [{ type: "text" as const, text: `Agreed in ${agreement.rounds} rounds. Stop calling tools.` }],
            };
          } catch (error) {
            return { content: [{ type: "text" as const, text: refusalText(error) }], isError: true };
          }
        },
      ),
    ],
  });

  try {
    const response = query({
      prompt:
        "Begin. Call get_session to see where the negotiation stands, then take your turn. " +
        "Keep going until the session is agreed or closed, then stop.",
      options: {
        model: input.model ?? "claude-sonnet-5-5",
        // Each tool call is a turn and an agent reads the session between
        // moves, so a twelve-round negotiation can run past sixty. Too low a
        // ceiling hands a live session to the rule agent for no reason.
        maxTurns: input.maxTurns ?? 140,
        systemPrompt: systemPrompt(role, input.persona, input.brief),
        mcpServers: { jang: server },
        allowedTools: ["mcp__jang__get_session", "mcp__jang__offer", "mcp__jang__counter", "mcp__jang__accept"],
        permissionMode: "bypassPermissions",
      },
    });

    for await (const message of response) {
      if (message.type === "assistant") turns += 1;
    }
    return { role, turns, toolCalls };
  } catch (error) {
    return { role, turns, toolCalls, error: error instanceof Error ? error.message : String(error) };
  }
}
