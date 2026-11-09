/**
 * A deterministic negotiator.
 *
 * It concedes on a time schedule: it opens near its own ideal and walks its
 * target utility down toward its reservation value as the rounds run out. Among
 * all packages that still meet today's target, it picks the one closest to what
 * the counterparty last asked for, which is how it finds trades that are
 * cheap for it and valuable for them, rather than only haggling on price.
 *
 * Being deterministic is the point: the benchmark needs runs it can repeat.
 */
import { packagesOf, type SessionView } from "../src/lib/jang/session.ts";
import type { Dimension, Mandate, Terms } from "../src/lib/jang/types.ts";
import { utility } from "../src/lib/jang/utility.ts";
import { checkTermsAgainstMandate } from "../src/lib/jang/mandate.ts";

export type Decision =
  /** `offerId` names the package when the standing offer carries alternatives. */
  | { action: "accept"; reason: string; offerId?: string }
  | { action: "offer"; terms: Terms; note: string; targetUtility: number; alternatives?: Terms[] }
  | { action: "wait" }
  | { action: "stop"; reason: string };

export type RuleOptions = {
  /** >1 concedes late and slowly, 1 concedes linearly, <1 concedes early. */
  toughness?: number;
  /** How many values per dimension to consider. Higher is slower but finer. */
  grid?: number;
  /**
   * HW7 Option 1. With fewer than two offers left, concede straight to the
   * reservation value instead of following the schedule. Off by default.
   */
  deadlineAware?: boolean;
  /**
   * HW7 fix. The shipped strategy judges the counterparty's package by utility
   * alone, so it can try to accept a package that breaks one of its own hard
   * bounds (a price under its floor that other terms make up for in utility).
   * JANG refuses that accept, and the agent then never counters. With this on,
   * the agent only accepts packages inside its own mandate. Off by default.
   */
  respectBounds?: boolean;
  /**
   * MESO (multiple equivalent simultaneous offers). Alongside each counter,
   * put up to two more packages on the table that are worth about the same to
   * us but differ as much as possible from each other, and let the
   * counterparty pick. Off by default.
   */
  meso?: boolean;
};

/** MESO alternatives must be worth no more than this above the main package to us. */
const MESO_BAND = 0.03;

/** Candidate values for one dimension, inside both the item's range and the mandate's bounds. */
function candidates(dimension: Dimension, mandate: Mandate, grid: number, anchor?: number): number[] {
  const constraint = mandate.constraints[dimension.key] ?? {};
  const low = Math.max(dimension.min, constraint.min ?? dimension.min);
  const high = Math.min(dimension.max, constraint.max ?? dimension.max);
  if (high < low) return [];

  const snap = (value: number) => {
    const stepped = Math.round((value - low) / dimension.step) * dimension.step + low;
    return Math.min(high, Math.max(low, Number(stepped.toFixed(6))));
  };

  const values = new Set<number>([snap(low), snap(high)]);
  for (let i = 1; i < grid - 1; i += 1) values.add(snap(low + ((high - low) * i) / (grid - 1)));
  // Our own ideal, so we open at what we actually want rather than at whatever
  // the grid happens to land on beyond it.
  const preference = mandate.preferences[dimension.key];
  if (preference) {
    values.add(snap(preference.ideal));
    values.add(snap(preference.worst));
  }
  // Always consider standing exactly where the counterparty stood: that is the
  // package most likely to be acceptable to them at equal cost to us.
  if (anchor !== undefined && anchor >= low && anchor <= high) values.add(snap(anchor));
  return [...values].sort((a, b) => a - b);
}

function bestPossible(view: SessionView, grid: number): number {
  const mandate = view.yourMandate;
  const ideal: Terms = {};
  for (const dimension of view.itemSpec.dimensions) {
    const options = candidates(dimension, mandate, grid);
    let best = options[0];
    let bestScore = -Infinity;
    for (const value of options) {
      const score = utility({ ...ideal, [dimension.key]: value }, mandate);
      if (score > bestScore) {
        bestScore = score;
        best = value;
      }
    }
    ideal[dimension.key] = best;
  }
  return utility(ideal, mandate);
}

/**
 * Distance from a package to the counterparty's last request, 0..1.
 *
 * Without `weights` every dimension counts the same, which is all an agent can
 * do when it does not know what the other side cares about. With them (from a
 * disclosed priority order), standing close to their ask on what matters most
 * to them counts for more, so the search trades on the terms that are cheap
 * for us and valuable for them.
 */
function distanceToTheirAsk(
  terms: Terms,
  theirAsk: Terms | undefined,
  dimensions: Dimension[],
  weights?: Record<string, number>,
): number {
  if (!theirAsk) return 0;
  let total = 0;
  for (const dimension of dimensions) {
    const span = dimension.max - dimension.min || 1;
    const gap = Math.abs((terms[dimension.key] ?? 0) - (theirAsk[dimension.key] ?? 0)) / span;
    total += weights ? gap * (weights[dimension.key] ?? 0) : gap;
  }
  return weights ? total : total / dimensions.length;
}

/**
 * Weights implied by an order alone: rank-order centroid weights, the
 * standard estimate when only the ranking is known. They sum to 1. Dimensions
 * missing from the order share nothing; with no order there are no weights.
 */
export function weightsFromOrder(order: string[] | undefined, dimensions: Dimension[]): Record<string, number> | undefined {
  const ranked = (order ?? []).filter((key) => dimensions.some((d) => d.key === key));
  if (ranked.length === 0) return undefined;
  const n = ranked.length;
  const weights: Record<string, number> = {};
  ranked.forEach((key, i) => {
    let w = 0;
    for (let k = i + 1; k <= n; k += 1) w += 1 / k;
    weights[key] = w / n;
  });
  return weights;
}

export function decide(view: SessionView, options: RuleOptions = {}): Decision {
  const toughness = options.toughness ?? 2.2;
  const grid = options.grid ?? 9;
  const mandate = view.yourMandate;
  const dimensions = view.itemSpec.dimensions;

  if (view.status !== "open") return { action: "stop", reason: `session is ${view.status}` };

  const standing = view.standingOffer;
  if (standing && standing.fromAgentId === view.you.agentId) return { action: "wait" };
  // When they offer several packages, the one that matters is the one best
  // for us: it is the one we would accept, and the one we counter from.
  const theirs = standing ? bestPackageForMe(packagesOf(standing), mandate, options.respectBounds) : undefined;
  const multi = standing ? packagesOf(standing).length > 1 : false;
  const pick = theirs && multi ? { offerId: theirs.offerId } : {};

  const ceiling = bestPossible(view, grid);
  const floor = mandate.reservationUtility;
  // How far through the negotiation we are; at the end we are down to our floor.
  const elapsed = Math.min(1, view.roundsUsed / Math.max(1, view.maxRounds - 1));
  let target = Math.max(floor, ceiling - (ceiling - floor) * Math.pow(elapsed, toughness));
  // Deadline-aware (HW7 Option 1): with fewer than two offers left in the
  // session, no deal is worth nothing, so drop straight to the reservation value.
  if (options.deadlineAware && view.roundsUsed >= view.maxRounds - 2) target = floor;

  // With respectBounds, a package outside our own hard limits is worth nothing to us.
  const acceptable = !theirs || !options.respectBounds || checkTermsAgainstMandate(theirs.terms, mandate).ok;
  const onTheTable = theirs && acceptable ? utility(theirs.terms, mandate) : -Infinity;
  if (theirs && onTheTable >= target) {
    return { action: "accept", ...pick, reason: `their package is worth ${onTheTable.toFixed(3)} to me, at or above my target ${target.toFixed(3)}` };
  }

  const counters = bestCounters(view, target, grid, theirs?.terms, options.meso ? 3 : 1);
  const counter = counters[0];
  if (!counter) {
    if (theirs && onTheTable >= floor) {
      return { action: "accept", ...pick, reason: `nothing better is reachable and ${onTheTable.toFixed(3)} still clears my reservation` };
    }
    return { action: "stop", reason: "no package inside my mandate is reachable" };
  }

  // Never counter with something worse for me than what is already on the table.
  if (theirs && onTheTable >= utility(counter, mandate)) {
    return { action: "accept", ...pick, reason: `their package beats my own next move, so there is nothing to gain by countering` };
  }

  const alternatives = counters.slice(1);
  return {
    action: "offer",
    terms: counter,
    ...(alternatives.length > 0 ? { alternatives } : {}),
    note: alternatives.length > 0 ? mesoNote(view, theirs?.terms, alternatives.length + 1) : noteFor(view, counter, theirs?.terms),
    targetUtility: target,
  };
}

/**
 * The counterparty's package worth most to us. With `respectBounds`, a
 * package outside our own hard limits is not a candidate at all; when none is
 * left the main package still stands, scored as worthless by the caller.
 */
function bestPackageForMe(
  packages: { offerId: string; terms: Terms }[],
  mandate: Mandate,
  respectBounds: boolean | undefined,
): { offerId: string; terms: Terms } {
  const eligible = respectBounds ? packages.filter((p) => checkTermsAgainstMandate(p.terms, mandate).ok) : packages;
  if (eligible.length === 0) return packages[0];
  return eligible.reduce((best, p) => (utility(p.terms, mandate) > utility(best.terms, mandate) ? p : best));
}

function mesoNote(view: SessionView, theirAsk: Terms | undefined, count: number): string {
  const lead = theirAsk ? "I cannot take that package as it stands." : "Opening proposal.";
  return `${lead} Here are ${count} packages that work equally well for me; pick whichever suits you best, or counter from the one closest to what you need.`;
}

/**
 * Among packages worth at least `target` to us, the one closest to the
 * counterparty's last ask, then (MESO, `count` > 1) up to `count - 1` more
 * worth about the same to us, each as far as possible from those already
 * chosen. Searched over a coarse grid per dimension.
 */
function bestCounters(view: SessionView, target: number, grid: number, theirAsk: Terms | undefined, count: number): Terms[] {
  const primary = bestCounter(view, target, grid, theirAsk, count > 1, weightsFromOrder(view.counterpartyPriorities, view.itemSpec.dimensions));
  if (!primary) return [];
  if (count <= 1) return [primary.terms];

  const mandate = view.yourMandate;
  const dimensions = view.itemSpec.dimensions;
  const ceiling = Math.max(target, primary.score) + MESO_BAND;
  const pool = primary.pool.filter((p) => p.score <= ceiling);
  const chosen: Terms[] = [primary.terms];
  while (chosen.length < count) {
    let next: { terms: Terms; spread: number } | undefined;
    for (const p of pool) {
      const spread = Math.min(...chosen.map((c) => distanceToTheirAsk(p.terms, c, dimensions)));
      if (spread <= 1e-9) continue;
      if (!next || spread > next.spread + 1e-9) next = { terms: p.terms, spread };
    }
    if (!next) break;
    chosen.push(next.terms);
  }
  // Every package must clear what the owner authorised, as JANG will check.
  return chosen.filter((terms) => checkTermsAgainstMandate(terms, mandate).ok);
}

function bestCounter(
  view: SessionView,
  target: number,
  grid: number,
  theirAsk: Terms | undefined,
  collect = false,
  weights?: Record<string, number>,
): { terms: Terms; score: number; pool: { terms: Terms; score: number }[] } | undefined {
  const mandate = view.yourMandate;
  const dimensions = view.itemSpec.dimensions;
  const axes = dimensions.map((dimension) => ({
    dimension,
    values: candidates(dimension, mandate, grid, theirAsk?.[dimension.key]),
  }));
  if (axes.some((axis) => axis.values.length === 0)) return undefined;

  let best: { terms: Terms; distance: number; score: number } | undefined;
  const pool: { terms: Terms; score: number }[] = [];
  const current: Terms = {};

  const walk = (index: number): void => {
    if (index === axes.length) {
      const score = utility(current, mandate);
      if (score < target) return;
      if (collect) pool.push({ terms: { ...current }, score });
      const distance = distanceToTheirAsk(current, theirAsk, dimensions, weights);
      if (!best || distance < best.distance - 1e-9 || (Math.abs(distance - best.distance) < 1e-9 && score > best.score)) {
        best = { terms: { ...current }, distance, score };
      }
      return;
    }
    const axis = axes[index];
    for (const value of axis.values) {
      current[axis.dimension.key] = value;
      walk(index + 1);
    }
    delete current[axis.dimension.key];
  };
  walk(0);

  return best ? { terms: best.terms, score: best.score, pool } : undefined;
}

/**
 * A message that explains the move without disclosing anything about our limits:
 * what we conceded since our own last offer, and where we still need movement.
 */
function noteFor(view: SessionView, terms: Terms, theirAsk: Terms | undefined): string {
  if (!theirAsk) return "Opening proposal. Tell me which of these terms matters most to you and I will trade against it.";

  const mine = [...view.offers].reverse().find((offer) => offer.fromAgentId === view.you.agentId);
  const names = (keys: string[]) =>
    keys.map((key) => view.itemSpec.dimensions.find((d) => d.key === key)?.label.toLowerCase() ?? key);

  const conceded = mine
    ? names(
        view.itemSpec.dimensions
          .filter((d) => {
            const before = mine.terms[d.key];
            const now = terms[d.key];
            const theirs = theirAsk[d.key];
            // Moved, and moved in their direction.
            return before !== now && Math.abs(now - theirs) < Math.abs(before - theirs);
          })
          .map((d) => d.key),
      )
    : [];

  const stillApart = names(view.itemSpec.dimensions.filter((d) => terms[d.key] !== theirAsk[d.key]).map((d) => d.key));

  if (!stillApart.length) return "That works for me on every term.";
  const opening = conceded.length ? `I have moved toward you on ${conceded.join(" and ")}.` : "I cannot take that package as it stands.";
  return `${opening} We are still apart on ${stillApart.join(" and ")}.`;
}
