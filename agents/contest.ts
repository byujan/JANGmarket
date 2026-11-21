import type { Market } from "../src/lib/jang/types.ts";

/**
 * The contest for the item, as far as the agent itself is concerned. Your own
 * other negotiations are alternatives and strengthen you. Nothing is said about
 * the counterparty's other negotiations: JANG does not report them.
 */
export function contestLines(market: Market): string[] {
  const lines: string[] = [];
  const others = Math.max(0, market.openSessions - 1);
  if (market.openSessions > 1 || market.remaining <= 1) {
    lines.push(
      `You may still commit to ${market.remaining} of the ${market.authorised} your owner authorised, ` +
        `and you have ${others === 0 ? "no other negotiation" : `${others} other negotiation${others === 1 ? "" : "s"}`} ` +
        `of your own open for this item.`,
    );
  }
  if (market.remaining > 0 && market.openSessions > market.remaining) {
    lines.push(
      `That is more counterparties than you have units, so you have alternatives: you need not concede quickly to ` +
        `this one, though by the end a deal that clears your reservation is still worth taking.`,
    );
  }
  return lines;
}
