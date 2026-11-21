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

/** The advertisement behind a listing, when the item was listed by hand. */
export type Listing = { description?: string; termsNote?: string };

export type Side = {
  agentId: string;
  role: Role;
  /** Falls back to a default stance when the owner set none. */
  posture?: Posture;
  /** What the owner wrote when registering the agent, if anything. */
  brief?: string;
  /** JANG's own stand-in, which has no story of its own. */
  isHouse: boolean;
  /**
   * A hand-written persona, where the item has one. A worked example ships
   * with both sides' positions written out; the house standing in for one of
   * them should bargain with that in hand rather than from first principles.
   */
  persona?: string;
};

/** Switched off with JANG_CONSOLE_LLM=off, which leaves the rule agent in charge. */
const llmEnabled = (): boolean => process.env.JANG_CONSOLE_LLM !== "off";

/**
 * Who the agent is told it is. Deliberately thin: the mandate carries the
 * numbers and `get_session` hands it over, so this only has to establish a
 * voice and stop the model inventing facts about the item.
 */
function personaFor(side: Side, itemTitle: string, listing?: Listing): string {
  // A worked example's own words beat anything derived. Without them the house
  // was told only that it had no story, and it showed: on the television it
  // opened at 2,400 against its own ideal of 1,349 and never reached the
  // 1,050 it would have taken, which left a cold-start buyer unable to close.
  if (side.persona?.trim()) {
    return (
      `You are negotiating as the ${side.role} for "${itemTitle}". ${side.persona.trim()}\n\n` +
      `Your mandate is the whole of your authority, and JANG refuses anything beyond it. ` +
      `Do not invent facts about the item beyond what you have been told here.`
    );
  }

  const base = side.isHouse
    ? `You are JANG's house agent, standing in as the ${side.role} for "${itemTitle}". ` +
      `You have no history with this item and no story beyond the mandate you were given. ` +
      `Bargain it sensibly and concede slowly. Never invent facts about the item's condition, ` +
      `history or provenance beyond what the advertisement below tells you.`
    : `You are negotiating as the ${side.role} for "${itemTitle}" on behalf of the owner who ` +
      `registered you. Your mandate is the whole of your authority. Do not invent facts about ` +
      `the item beyond what the session tells you.`;

  // The advertisement, where there is one. A worked example ships with a
  // hand-written persona on both sides; a listing has only what its owner
  // wrote, so this is the whole of the house's character.
  const advert = [listing?.description, listing?.termsNote]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!advert) return base;
  // Both sides see this: it was written on a public listing, so treating it as
  // one side's secret would be a fiction. It is not a term, and saying so
  // keeps an agent from behaving as though JANG would enforce it.
  return (
    `${base}\n\nThis is the advertisement, in the lister's own words. ` +
    `It is context, not a term: JANG enforces only the terms in the session, and nothing here ` +
    `is binding on either side. Use it to find trades and to sound like you have read the ad.\n\n` +
    `> ${advert.replace(/\n/g, "\n> ")}`
  );
}

async function runRule(sessionId: string, side: Side): Promise<void> {
  await runRuleAgent({
    label: side.role,
    agent: new ServicePort(jang, side.agentId, sessionId),
    // endgame: the last offer is chosen to clear the other side's limits, not to
    // sit nearest their ask (docs/final/narrow-tuning.md, fourth attempt).
    options: { toughness: toughnessOf(side.posture), respectBounds: true, endgame: true, endgameDirections: "opposed" },
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
  /** The advertisement behind the item, if it was listed by hand. */
  listing?: Listing;
  sides: [Side, Side];
}): Promise<{ by: "claude" | "rule"; reason?: string }> {
  const { sessionId, itemTitle, listing, sides } = input;

  if (!llmEnabled()) {
    await Promise.all(sides.map((side) => runRule(sessionId, side)));
    return { by: "rule", reason: "JANG_CONSOLE_LLM is off" };
  }

  const results = await Promise.all(
    sides.map((side) =>
      runLlmAgentInProcess({
        role: side.role,
        persona: personaFor(side, itemTitle, listing),
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
  listing?: Listing;
  side: Side;
}): Promise<{ by: "claude" | "rule"; reason?: string }> {
  const { sessionId, itemTitle, listing, side } = input;

  if (llmEnabled()) {
    const result = await runLlmAgentInProcess({
      role: side.role,
      persona: personaFor(side, itemTitle, listing),
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
