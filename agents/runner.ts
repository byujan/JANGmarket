/**
 * Drives one agent to completion. The strategy decides; the runner only moves
 * the agent through MCP and reports what happened.
 */
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Agreement, Terms } from "../src/lib/jang/types.ts";
import { ToolRefusal, type NegotiationPort } from "./port.ts";
import { decide, type RuleOptions } from "./rule-strategy.ts";

export type AgentEvent =
  | { kind: "offer"; label: string; round: number; terms: Terms; note: string }
  | { kind: "accept"; label: string; agreement: Agreement }
  | { kind: "refused"; label: string; code: string; detail: string }
  | { kind: "stopped"; label: string; reason: string };

export type RunResult = {
  label: string;
  agreement?: Agreement;
  toolCalls: number;
  stoppedBecause?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runRuleAgent(input: {
  label: string;
  agent: NegotiationPort;
  options?: RuleOptions;
  onEvent?: (event: AgentEvent) => void;
  pollMs?: number;
  maxTurns?: number;
  /** Pause before each move, so a human can follow along live. */
  thinkMs?: number;
}): Promise<RunResult> {
  const { label, agent, onEvent } = input;
  const pollMs = input.pollMs ?? 80;
  const maxTurns = input.maxTurns ?? 200;

  // A deterministic strategy that is refused will make the same move again on
  // the same view, so a repeated refusal means it is stuck: stop rather than spin.
  let lastRefusal = "";
  let refusalsInARow = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    let view: SessionView;
    try {
      view = await agent.getSession();
    } catch (error) {
      onEvent?.({ kind: "stopped", label, reason: String(error) });
      return { label, toolCalls: agent.callCount, stoppedBecause: String(error) };
    }

    if (view.status !== "open") {
      return { label, toolCalls: agent.callCount, stoppedBecause: `session ${view.status}` };
    }

    const decision = decide(view, input.options);

    if (decision.action !== "wait" && input.thinkMs) {
      await sleep(input.thinkMs);
    }

    if (decision.action === "wait") {
      await sleep(pollMs);
      continue;
    }

    if (decision.action === "stop") {
      onEvent?.({ kind: "stopped", label, reason: decision.reason });
      return { label, toolCalls: agent.callCount, stoppedBecause: decision.reason };
    }

    try {
      if (decision.action === "accept") {
        const { agreement } = await agent.accept(decision.offerId);
        onEvent?.({ kind: "accept", label, agreement });
        return { label, agreement, toolCalls: agent.callCount };
      }

      const after = await agent.offer(decision.terms, decision.note, decision.alternatives);
      onEvent?.({
        kind: "offer",
        label,
        round: after.standingOffer?.round ?? after.roundsUsed,
        terms: decision.terms,
        note: decision.note,
      });
    } catch (error) {
      if (error instanceof ToolRefusal) {
        // A refusal is information: re-read the session and decide again.
        onEvent?.({ kind: "refused", label, code: error.code, detail: error.message });
        if (error.code === "SESSION_CLOSED" || error.code === "ROUND_LIMIT") {
          return { label, toolCalls: agent.callCount, stoppedBecause: error.code };
        }
        refusalsInARow = error.code === lastRefusal ? refusalsInARow + 1 : 1;
        lastRefusal = error.code;
        if (refusalsInARow >= 3) {
          return { label, toolCalls: agent.callCount, stoppedBecause: `refused ${decision.action} three times: ${error.code}` };
        }
        await sleep(pollMs);
        continue;
      }
      throw error;
    }
  }

  return { label, toolCalls: agent.callCount, stoppedBecause: "turn limit" };
}
