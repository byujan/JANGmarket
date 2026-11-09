/**
 * What a strategy needs from JANG, independent of how it gets there.
 *
 * The demo drives this over MCP, which is the interface the product offers.
 * The benchmark drives the same strategies over REST, because it runs hundreds
 * of negotiations and the cost of a process per agent would dominate the
 * timings it is trying to measure.
 */
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Agreement, Terms } from "../src/lib/jang/types.ts";

export interface NegotiationPort {
  getSession(): Promise<SessionView>;
  /** `alternatives`: MESO packages offered in the same turn (at most two). */
  offer(terms: Terms, note: string, alternatives?: Terms[]): Promise<SessionView>;
  /** `offerId` names the package when the standing offer carries alternatives. */
  accept(offerId?: string): Promise<{ agreement: Agreement; session: SessionView }>;
  /** How many calls this agent has made, for reporting. */
  readonly callCount: number;
}

/** JANG declined the move. The code tells the strategy what to do next. */
export class ToolRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolRefusal";
  }
}
