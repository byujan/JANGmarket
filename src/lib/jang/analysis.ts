/**
 * Readings of a negotiation drawn from the standard framework taught in
 * MIT 15.665, computed from both mandates and so available to the operator
 * only. None of this is ever shown to an agent.
 *
 * Three constructs, each cheap to compute from what a session already holds:
 *
 *  - **Issue types** (Class 4). An issue is *compatible* when both sides want
 *    the same end of the range, *distributive* when they want opposite ends
 *    and value it about equally, and *integrative* when they want opposite
 *    ends but one cares far more, which is what makes a trade possible.
 *  - **The compromise benchmark** (Class 4). Splitting every term down the
 *    middle is the intuitive move and usually the wrong one. The lecture's
 *    worked example reaches a joint 4,800 by compromise and 13,200 by
 *    trading; this measures the same gap for a real session.
 *  - **Concessions** (Class 3). "Declining magnitude of concessions is an
 *    unspoken signal to suggest closeness to the reservation price." The
 *    series below makes that signal visible after the fact.
 */
import type { GroundTruth } from "./frontier.ts";
import { quality } from "./frontier.ts";
import { checkTermsAgainstMandate } from "./mandate.ts";
import type { Dimension, ItemSpec, Mandate, Offer, Terms } from "./types.ts";
import { utility } from "./utility.ts";

/** One closed deal, as the operator's scatter plots it. */
export type DilemmaPoint = {
  sessionId: string;
  itemTitle: string;
  /** Joint surplus as a share of the most these two owners could have had. */
  created: number;
  /** The buyer's share of that surplus. 0.5 is an even split. */
  claimed: number;
  paretoOptimal: boolean;
};

export type IssueKind = "compatible" | "distributive" | "integrative";

export type Issue = {
  key: string;
  label: string;
  kind: IssueKind;
  /** Each side's share of its own total weight, so the two are comparable. */
  buyerWeight: number;
  sellerWeight: number;
  /** The value both sides prefer, when the issue is compatible. */
  sharedBest?: number;
};

/** Which end of a dimension this mandate reaches for. */
function prefersHigh(mandate: Mandate, key: string): boolean | undefined {
  const p = mandate.preferences[key];
  if (!p || p.ideal === p.worst) return undefined;
  return p.ideal > p.worst;
}

function weightShare(mandate: Mandate, key: string): number {
  const total = Object.values(mandate.preferences).reduce((sum, p) => sum + p.weight, 0);
  return total === 0 ? 0 : (mandate.preferences[key]?.weight ?? 0) / total;
}

/**
 * Classify every term. The split between distributive and integrative is a
 * judgement about degree, so it is drawn at a stated threshold rather than
 * pretending the data decides it: a term matters "far more" to one side when
 * their shares of their own attention differ by more than a tenth.
 */
export const INTEGRATIVE_GAP = 0.1;

export function classifyIssues(itemSpec: ItemSpec, buyer: Mandate, seller: Mandate): Issue[] {
  return itemSpec.dimensions.map((dimension: Dimension) => {
    const bHigh = prefersHigh(buyer, dimension.key);
    const sHigh = prefersHigh(seller, dimension.key);
    const buyerWeight = weightShare(buyer, dimension.key);
    const sellerWeight = weightShare(seller, dimension.key);

    if (bHigh === undefined || sHigh === undefined || bHigh === sHigh) {
      return {
        key: dimension.key,
        label: dimension.label,
        kind: "compatible" as const,
        buyerWeight,
        sellerWeight,
        sharedBest: bHigh === undefined ? undefined : bHigh ? dimension.max : dimension.min,
      };
    }

    return {
      key: dimension.key,
      label: dimension.label,
      kind: Math.abs(buyerWeight - sellerWeight) > INTEGRATIVE_GAP ? "integrative" : "distributive",
      buyerWeight,
      sellerWeight,
    };
  });
}

/**
 * A compatible issue that was not settled where both sides wanted it. The
 * lecture calls these lose-lose deals: both parties wanted the same option,
 * assumed a conflict, and traded it away.
 */
export function loseLose(terms: Terms, issues: Issue[]): Issue[] {
  return issues.filter(
    (issue) => issue.kind === "compatible" && issue.sharedBest !== undefined && terms[issue.key] !== issue.sharedBest,
  );
}

/** Splitting the difference on every term: the intuitive move, as a baseline. */
export function midpointPackage(itemSpec: ItemSpec): Terms {
  const terms: Terms = {};
  for (const d of itemSpec.dimensions) {
    const mid = (d.min + d.max) / 2;
    terms[d.key] = Math.round(mid / d.step) * d.step;
  }
  return terms;
}

export type Benchmark = {
  /** Joint surplus of the compromise package, as a share of the best available. */
  compromise: number;
  /** The same for what the agents actually agreed. */
  achieved: number;
  /** 1 by definition: the best any pair of these two owners could have done. */
  best: number;
  /**
   * Whether both owners would allow the compromise package at all. When they
   * would not, splitting the difference is not a worse deal, it is no deal,
   * and `compromise` is 0.
   */
  compromiseAllowed: boolean;
};

export function compromiseBenchmark(
  itemSpec: ItemSpec,
  buyer: Mandate,
  seller: Mandate,
  truth: GroundTruth,
  agreed: Terms,
): Benchmark {
  const mid = midpointPackage(itemSpec);

  // Whether either owner would allow it at all, which is a separate question
  // from how much joint value it carries. Scoring an unauthorised package by
  // its raw utility reads as a good compromise when it is in fact no deal.
  const allowed =
    checkTermsAgainstMandate(mid, buyer).ok && checkTermsAgainstMandate(mid, seller).ok;

  const midSurplus =
    utility(mid, buyer) - buyer.reservationUtility + (utility(mid, seller) - seller.reservationUtility);

  return {
    compromise: allowed && truth.maxSurplus > 0 ? Math.max(0, midSurplus) / truth.maxSurplus : 0,
    achieved: quality(agreed, buyer, seller, truth).efficiency,
    best: 1,
    compromiseAllowed: allowed,
  };
}

export type ConcessionPoint = {
  round: number;
  /** What this agent's own offer was worth to its own owner. */
  toSelf: number;
  /** How far it moved from that agent's previous offer, downward in own value. */
  conceded: number;
};

/**
 * Each side's own valuation of its own successive offers. A healthy
 * negotiation shows both lines falling with shrinking steps.
 */
export function concessionSeries(
  offers: Offer[],
  agentId: string,
  mandate: Mandate,
): ConcessionPoint[] {
  const mine = offers.filter((offer) => offer.fromAgentId === agentId);
  let previous: number | undefined;
  return mine.map((offer) => {
    const toSelf = utility(offer.terms, mandate);
    const conceded = previous === undefined ? 0 : Math.max(0, previous - toSelf);
    previous = toSelf;
    return { round: offer.round, toSelf, conceded };
  });
}
