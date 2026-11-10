/**
 * The Pareto frontier of a negotiation: what a deal between these two owners
 * could have been, by exhaustive search over the item's step lattice.
 *
 * It is a function of the two mandates and the item, not of any offer, so it
 * is computed once per session and only read after that. It is built from both
 * owners' private mandates, which makes it as secret as they are: nothing in
 * here may ever reach an agent's session view. That is why it lives outside
 * the Session type, in a cache keyed by session id, where redactSessionFor has
 * no way to pick it up.
 *
 * Promoted from scripts/hw7/lib.ts unchanged, so HW7's numbers and the
 * product's numbers come from the same code.
 */
import { checkTermsAgainstMandate } from "./mandate.ts";
import type { ItemSpec, Mandate, Terms } from "./types.ts";
import { utility } from "./utility.ts";

export type Point = { terms: Terms; buyer: number; seller: number };

export type GroundTruth = {
  /** Packages acceptable to both owners (bounds + reservation), on the lattice. */
  feasible: Point[];
  /** The Pareto frontier of `feasible`, by buyer utility descending. */
  frontier: Point[];
  /** Largest joint surplus (uB - rB) + (uS - rS) available. */
  maxSurplus: number;
};

export type Quality = {
  buyerValue: number;
  sellerValue: number;
  /** No feasible package is at least as good for both and strictly better for one. */
  paretoOptimal: boolean;
  /** Euclidean distance in (buyer, seller) utility space to the nearest frontier point. */
  paretoDistance: number;
  /** Joint surplus over both reservation values. */
  surplus: number;
  /** surplus / maxSurplus available in this market (1 = best possible joint outcome). */
  efficiency: number;
  /** Buyer's share of the joint surplus (0.5 = even split). */
  buyerShare: number;
};

/** Every package on the item's step lattice that sits inside both owners' bounds. */
export function lattice(itemSpec: ItemSpec, mandates: Mandate[]): Terms[] {
  const axes = itemSpec.dimensions.map((d) => {
    const lows: number[] = [];
    const highs: number[] = [];
    for (const mandate of mandates) {
      const c = mandate.constraints[d.key];
      if (c?.min !== undefined) lows.push(c.min);
      if (c?.max !== undefined) highs.push(c.max);
    }
    const low = Math.max(d.min, ...lows);
    const high = Math.min(d.max, ...highs);
    const values: number[] = [];
    // Values on the item's own step lattice, anchored at the item minimum.
    const first = d.min + Math.ceil((low - d.min) / d.step - 1e-9) * d.step;
    for (let v = first; v <= high + 1e-9; v += d.step) values.push(Number(v.toFixed(6)));
    return { key: d.key, values };
  });
  const out: Terms[] = [];
  const current: Terms = {};
  const walk = (i: number) => {
    if (i === axes.length) {
      out.push({ ...current });
      return;
    }
    for (const v of axes[i].values) {
      current[axes[i].key] = v;
      walk(i + 1);
    }
  };
  walk(0);
  return out;
}

export function groundTruth(itemSpec: ItemSpec, buyer: Mandate, seller: Mandate, now?: Date): GroundTruth {
  const feasible: Point[] = [];
  for (const terms of lattice(itemSpec, [buyer, seller])) {
    if (!checkTermsAgainstMandate(terms, buyer, now).ok || !checkTermsAgainstMandate(terms, seller, now).ok) continue;
    feasible.push({ terms, buyer: utility(terms, buyer), seller: utility(terms, seller) });
  }
  // Frontier: one sort, then a sweep keeping strictly improving seller utility.
  const sorted = [...feasible].sort((a, b) => b.buyer - a.buyer || b.seller - a.seller);
  const frontier: Point[] = [];
  let bestSeller = -Infinity;
  for (const p of sorted) {
    if (p.seller > bestSeller + 1e-12) {
      frontier.push(p);
      bestSeller = p.seller;
    }
  }
  const maxSurplus = feasible.reduce(
    (m, p) => Math.max(m, p.buyer - buyer.reservationUtility + p.seller - seller.reservationUtility),
    0,
  );
  return { feasible, frontier, maxSurplus };
}

export function quality(terms: Terms, buyer: Mandate, seller: Mandate, truth: GroundTruth): Quality {
  const b = utility(terms, buyer);
  const s = utility(terms, seller);
  const eps = 1e-9;
  const dominated = truth.feasible.some((p) => p.buyer >= b - eps && p.seller >= s - eps && (p.buyer > b + eps || p.seller > s + eps));
  const paretoDistance = truth.frontier.reduce((m, p) => Math.min(m, Math.hypot(p.buyer - b, p.seller - s)), Infinity);
  const sb = b - buyer.reservationUtility;
  const ss = s - seller.reservationUtility;
  const surplus = sb + ss;
  return {
    buyerValue: b,
    sellerValue: s,
    paretoOptimal: !dominated,
    paretoDistance: Number.isFinite(paretoDistance) ? paretoDistance : 0,
    surplus,
    efficiency: truth.maxSurplus > 0 ? surplus / truth.maxSurplus : 0,
    buyerShare: surplus > 0 ? sb / surplus : 0.5,
  };
}

/**
 * The package JANG could have proposed just before signing: at least as good
 * for both owners, strictly better for one, and of those the one adding the
 * most joint value. Undefined when the deal was already Pareto-optimal.
 *
 * Operator-only. Offering it to the agents would tell each something about
 * the other's preferences, so it is recorded and shown, never sent.
 */
export function bestImprovement(
  terms: Terms,
  buyer: Mandate,
  seller: Mandate,
  truth: GroundTruth,
): { terms: Terms; buyerGain: number; sellerGain: number } | undefined {
  const b = utility(terms, buyer);
  const s = utility(terms, seller);
  const eps = 1e-9;
  let best: { terms: Terms; buyerGain: number; sellerGain: number } | undefined;
  for (const p of truth.frontier) {
    const buyerGain = p.buyer - b;
    const sellerGain = p.seller - s;
    if (buyerGain < -eps || sellerGain < -eps || (buyerGain <= eps && sellerGain <= eps)) continue;
    if (!best || buyerGain + sellerGain > best.buyerGain + best.sellerGain + eps) best = { terms: p.terms, buyerGain, sellerGain };
  }
  return best;
}

// ---------------------------------------------------------------- per-session cache

const CACHE_LIMIT = 500;
const cache = new Map<string, GroundTruth>();

/**
 * The frontier for a session, computed on first use and then read. Mandates
 * are fixed when a session opens, so the key never goes stale. Recomputing is
 * cheap (milliseconds at five terms), so losing the cache to a restart, or
 * holding a separate one per server instance, costs nothing but time.
 */
export function sessionFrontier(session: {
  sessionId: string;
  itemSpec: ItemSpec;
  participants: { buyer: string; seller: string };
  mandates: Record<string, Mandate>;
  createdAt: string;
}): GroundTruth {
  const hit = cache.get(session.sessionId);
  if (hit) return hit;
  // Judge feasibility as of when the session opened, so a mandate expiring
  // later does not change what the deal could have been.
  const truth = groundTruth(
    session.itemSpec,
    session.mandates[session.participants.buyer],
    session.mandates[session.participants.seller],
    new Date(session.createdAt),
  );
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(session.sessionId, truth);
  return truth;
}
