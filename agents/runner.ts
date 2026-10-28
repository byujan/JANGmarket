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
}): Promise<RunResult> {
  const { label, agent, onEvent } = input;
  const pollMs = input.pollMs ?? 80;
  const maxTurns = input.maxTurns ?? 200;

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
        const { agreement } = await agent.accept();
        onEvent?.({ kind: "accept", label, agreement });
        return { label, agreement, toolCalls: agent.callCount };
      }

      const after = await agent.offer(decision.terms, decision.note);
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
        await sleep(pollMs);
        continue;
      }
      throw error;
    }
  }

  return { label, toolCalls: agent.callCount, stoppedBecause: "turn limit" };
}
