/**
 * Who actually does the bargaining when the console starts a negotiation.
 *
 * Claude drives both sides, so every note on the transcript is something an
 * agent meant rather than a sentence assembled from a template. The
 * deterministic agent is the net underneath: if Claude cannot start — no
 * credentials on this machine, a usage cap already hit — or dies partway, the
 * rule agent finishes the session so it still reaches a conclusion.
 *
 * When that happens it is written down. A templated note sitting in a
 * transcript beside real reasoning, with nothing to tell them apart, would
 * make the whole record untrustworthy.
 */
import { runLlmAgentInProcess } from "../../../agents/in-process-llm.ts";
import { runRuleAgent } from "../../../agents/runner.ts";
import { ServicePort } from "../../../agents/service-port.ts";
import { toughnessOf, type Posture } from "../posture.ts";
import { jang } from "./service.ts";
import { store } from "../store/index.ts";
import type { Role } from "../jang/types.ts";

export type Side = {
  agentId: string;
  role: Role;
  /** Falls back to a default stance when the owner set none. */
  posture?: Posture;
  /** What the owner wrote when registering the agent, if anything. */
  brief?: string;
  /** JANG's own stand-in, which has no story of its own. */
  isHouse: boolean;
};

/** Switched off with JANG_CONSOLE_LLM=off, which leaves the rule agent in charge. */
const llmEnabled = (): boolean => process.env.JANG_CONSOLE_LLM !== "off";

/**
 * Who the agent is told it is. Deliberately thin: the mandate carries the
 * numbers and `get_session` hands it over, so this only has to establish a
 * voice and stop the model inventing facts about the item.
 */
function personaFor(side: Side, itemTitle: string, listingNote?: string): string {
  const base = side.isHouse
    ? `You are JANG's house agent, standing in as the ${side.role} for "${itemTitle}". ` +
      `You have no history with this item and no story beyond the mandate you were given. ` +
      `Bargain it sensibly and concede slowly. Never invent facts about the item's condition, ` +
      `history or provenance: you do not know any.`
    : `You are negotiating as the ${side.role} for "${itemTitle}" on behalf of the owner who ` +
      `registered you. Your mandate is the whole of your authority. Do not invent facts about ` +
      `the item beyond what the session tells you.`;

  if (!listingNote?.trim()) return base;
  // Both sides see this: it was written on a public listing, so treating it as
  // one side's secret would be a fiction. It is not a term, and saying so
  // keeps an agent from behaving as though JANG would enforce it.
  return (
    `${base}\n\nThe listing says this about what else is open, in the lister's own words. ` +
    `It is context, not a term: JANG enforces only the terms in the session, and nothing here ` +
    `is binding on either side. Use it to find trades and to sound like you have read the ad.\n\n` +
    `> ${listingNote.trim().replace(/\n/g, "\n> ")}`
  );
}

async function runRule(sessionId: string, side: Side): Promise<void> {
  await runRuleAgent({
    label: side.role,
    agent: new ServicePort(jang, side.agentId, sessionId),
    options: { toughness: toughnessOf(side.posture), respectBounds: true },
    thinkMs: Number(process.env.JANG_AUTOPLAY_DELAY_MS ?? 1200),
    pollMs: 200,
  });
}

async function noteFallback(sessionId: string, reason: string): Promise<void> {
  await store.recordEvent({
    kind: "fallback",
    sessionId,
    code: "LLM_UNAVAILABLE",
    message: `the deterministic agent finished this negotiation: ${reason}`,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Run both sides to a conclusion.
 *
 * Both agents are started together and left to take turns through the service,
 * exactly as two separate processes would. Whatever happens, the session is
 * driven to a conclusion rather than left open.
 */
export async function negotiate(input: {
  sessionId: string;
  itemTitle: string;
  /** The listing's prose about what else is open, if it was listed by hand. */
  listingNote?: string;
  sides: [Side, Side];
}): Promise<{ by: "claude" | "rule"; reason?: string }> {
  const { sessionId, itemTitle, listingNote, sides } = input;

  if (!llmEnabled()) {
    await Promise.all(sides.map((side) => runRule(sessionId, side)));
    return { by: "rule", reason: "JANG_CONSOLE_LLM is off" };
  }

  const results = await Promise.all(
    sides.map((side) =>
      runLlmAgentInProcess({
        role: side.role,
        persona: personaFor(side, itemTitle, listingNote),
        brief: side.brief,
        port: new ServicePort(jang, side.agentId, sessionId),
      }),
    ),
  );

  const failed = results.find((result) => result.error);
  const session = await store.getSession(sessionId);
  if (!failed && session?.status !== "open") return { by: "claude" };

  // Either an agent broke, or both stopped while the session was still live —
  // a model that talks itself to a standstill leaves exactly the same mess as
  // one that crashed. The rule agent finishes from wherever they left it.
  const reason = failed?.error ?? "Claude stopped before the session closed";
  await noteFallback(sessionId, reason);
  await Promise.all(sides.map((side) => runRule(sessionId, side)));
  return { by: "rule", reason };
}

/**
 * Run a single side, for a session an outside agent opened against the house.
 *
 * The other side has somebody behind it already, so only the house is driven
 * here. Same preference and same net: Claude, or the rule agent with a note
 * saying why.
 */
export async function playOneSide(input: {
  sessionId: string;
  itemTitle: string;
  listingNote?: string;
  side: Side;
}): Promise<{ by: "claude" | "rule"; reason?: string }> {
  const { sessionId, itemTitle, listingNote, side } = input;

  if (llmEnabled()) {
    const result = await runLlmAgentInProcess({
      role: side.role,
      persona: personaFor(side, itemTitle, listingNote),
      brief: side.brief,
      port: new ServicePort(jang, side.agentId, sessionId),
    });
    if (!result.error) return { by: "claude" };
    await noteFallback(sessionId, result.error);
    await runRule(sessionId, side);
    return { by: "rule", reason: result.error };
  }

  await runRule(sessionId, side);
  return { by: "rule", reason: "JANG_CONSOLE_LLM is off" };
}
