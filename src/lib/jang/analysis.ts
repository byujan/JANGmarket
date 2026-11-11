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

/* -------------------------------------------------------------------------
   Readings taken from the offer stream itself. Timestamps, opening positions
   and direction of travel are all recorded and, until now, unread.
   ------------------------------------------------------------------------- */

/** The term a negotiation is mostly argued over: money, or the first one. */
export function axisOf(itemSpec: ItemSpec): Dimension {
  return itemSpec.dimensions.find((d) => d.unit === "USD") ?? itemSpec.dimensions[0];
}

export type Anchoring = {
  axis: Dimension;
  buyerOpen?: number;
  sellerOpen?: number;
  settled?: number;
  /**
   * Where the deal landed between the two opening positions: 0 at the
   * seller's opening, 1 at the buyer's. Class 2's anchoring question, asked
   * of a finished negotiation.
   */
  towardBuyer?: number;
};

export function anchoring(
  itemSpec: ItemSpec,
  offers: Offer[],
  buyerAgentId: string,
  settledTerms?: Terms,
): Anchoring {
  const axis = axisOf(itemSpec);
  const firstFrom = (isBuyer: boolean) =>
    offers.find((o) => (o.fromAgentId === buyerAgentId) === isBuyer)?.terms[axis.key];

  const buyerOpen = firstFrom(true);
  const sellerOpen = firstFrom(false);
  const settled = settledTerms?.[axis.key];

  let towardBuyer: number | undefined;
  if (buyerOpen !== undefined && sellerOpen !== undefined && settled !== undefined) {
    const span = buyerOpen - sellerOpen;
    towardBuyer = span === 0 ? 0.5 : Math.max(0, Math.min(1, (settled - sellerOpen) / span));
  }
  return { axis, buyerOpen, sellerOpen, settled, towardBuyer };
}

export type Reversal = {
  offerId: string;
  round: number;
  fromAgentId: string;
  /** What the counterparty lost between this side's previous offer and this one. */
  worseBy: number;
  /** The terms that moved away from the counterparty, for context. */
  pulledBack: { key: string; label: string; from: number; to: number }[];
};

/**
 * Offers that are worth *less to the counterparty* than the same side's
 * previous offer.
 *
 * Class 4 warns to "beware of sudden counterparty reversals at the end of
 * negotiations". The test has to be on the whole package: a multi-issue
 * negotiation moves individual terms backwards all the time, and that is
 * logrolling working, not bad faith. Only a package that leaves the other
 * side worse off than the last one did is a reversal.
 *
 * Needs the counterparty's mandate, so this is an operator's reading.
 */
export function reversals(
  itemSpec: ItemSpec,
  offers: Offer[],
  mandates: Record<string, Mandate>,
  participants: { buyer: string; seller: string },
): Reversal[] {
  const found: Reversal[] = [];
  const previous = new Map<string, Terms>();

  for (const offer of offers) {
    const mine = previous.get(offer.fromAgentId);
    const otherId = offer.fromAgentId === participants.buyer ? participants.seller : participants.buyer;
    const theirMandate = mandates[otherId];

    if (mine && theirMandate) {
      const before = utility(mine, theirMandate);
      const now = utility(offer.terms, theirMandate);
      if (now < before - 1e-9) {
        found.push({
          offerId: offer.offerId,
          round: offer.round,
          fromAgentId: offer.fromAgentId,
          worseBy: before - now,
          pulledBack: itemSpec.dimensions
            .filter((d) => mine[d.key] !== offer.terms[d.key])
            .map((d) => ({ key: d.key, label: d.label, from: mine[d.key], to: offer.terms[d.key] })),
        });
      }
    }
    previous.set(offer.fromAgentId, offer.terms);
  }
  return found;
}

export type Pace = {
  /** Seconds from the previous offer to this one. */
  steps: { round: number; fromAgentId: string; seconds: number }[];
  totalSeconds: number;
  /** Rounds used as a share of the budget. Near 1 means it went to the wire. */
  roundPressure: number;
};

export function pace(offers: Offer[], maxRounds: number): Pace {
  const steps = offers.map((offer, i) => ({
    round: offer.round,
    fromAgentId: offer.fromAgentId,
    seconds:
      i === 0
        ? 0
        : Math.max(0, (Date.parse(offer.createdAt) - Date.parse(offers[i - 1].createdAt)) / 1000),
  }));
  const first = offers[0] ? Date.parse(offers[0].createdAt) : 0;
  const last = offers.at(-1) ? Date.parse(offers.at(-1)!.createdAt) : 0;
  return {
    steps,
    totalSeconds: offers.length > 1 ? Math.max(0, (last - first) / 1000) : 0,
    roundPressure: maxRounds > 0 ? Math.min(1, offers.length / maxRounds) : 0,
  };
}
