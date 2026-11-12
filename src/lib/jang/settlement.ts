/**
 * What happens after two agents agree.
 *
 * JANG's job ends at a signed agreement: it says the two sides committed to
 * these terms under mandates it checked. Whether anyone then paid, shipped or
 * moved in is outside what JANG can observe, so the app does not claim to
 * know. It records what each owner says happened, and shows who has said what.
 *
 * That is deliberately weaker than settlement. Nothing here moves money or
 * proves delivery; it is a shared place for the two owners to agree that the
 * deal did, or did not, come off.
 */
export const MARKS = ["settled", "fell-through"] as const;
export type Mark = (typeof MARKS)[number];

export type SettlementMark = {
  ownerId: string;
  mark: Mark;
  /** The owner's own words, if they left any. */
  note?: string;
  at: string;
};

/**
 * `open` is every agreement until someone says otherwise, including one where
 * a single side has confirmed: one party's word is not the deal closing.
 */
export type Outcome = "open" | "settled" | "fell-through";

export type Settlement = {
  agreementId: string;
  sessionId: string;
  buyerOwnerId: string;
  sellerOwnerId: string;
  outcome: Outcome;
  marks: SettlementMark[];
  updatedAt: string;
};

/**
 * JANG's own house agent stands in as counterparty for the built-in markets.
 * It has nothing to deliver and nobody to chase, so it is treated as having
 * confirmed from the start rather than leaving every console deal waiting
 * forever on a party that cannot answer.
 */
export const HOUSE_OWNER = "jang-house";

/**
 * One side saying the deal fell through outweighs the other saying it closed:
 * a disputed deal is not a settled one, and the app should not display it as
 * though the matter were finished.
 */
export function outcomeOf(marks: SettlementMark[], sides: { buyerOwnerId: string; sellerOwnerId: string }): Outcome {
  const latest = (ownerId: string) =>
    ownerId === HOUSE_OWNER
      ? ("settled" as Mark)
      : marks.filter((m) => m.ownerId === ownerId).at(-1)?.mark;

  const buyer = latest(sides.buyerOwnerId);
  const seller = latest(sides.sellerOwnerId);
  if (buyer === "fell-through" || seller === "fell-through") return "fell-through";
  if (buyer === "settled" && seller === "settled") return "settled";
  return "open";
}

/** Replaces an owner's earlier mark rather than stacking another beside it. */
export function withMark(marks: SettlementMark[], mark: SettlementMark): SettlementMark[] {
  return [...marks.filter((existing) => existing.ownerId !== mark.ownerId), mark];
}

export const OUTCOME_COPY: Record<Outcome, { label: string; blurb: string }> = {
  open: {
    label: "Awaiting confirmation",
    blurb: "Signed and binding on both sides. Nobody has said yet whether it came off.",
  },
  settled: {
    label: "Settled",
    blurb: "Both owners say the deal was honoured.",
  },
  "fell-through": {
    label: "Fell through",
    blurb: "An owner says this deal did not happen. The agreement stands as a record of what was agreed.",
  },
};
