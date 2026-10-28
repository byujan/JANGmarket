/**
 * A deterministic negotiator.
 *
 * It concedes on a time schedule: it opens near its own ideal and walks its
 * target utility down toward its reservation value as the rounds run out. Among
 * all packages that still meet today's target, it picks the one closest to what
 * the counterparty last asked for — which is how it finds trades that are
 * cheap for it and valuable for them, rather than only haggling on price.
 *
 * Being deterministic is the point: the benchmark needs runs it can repeat.
 */
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Dimension, Mandate, Terms } from "../src/lib/jang/types.ts";
import { utility } from "../src/lib/jang/utility.ts";

export type Decision =
  | { action: "accept"; reason: string }
  | { action: "offer"; terms: Terms; note: string; targetUtility: number }
  | { action: "wait" }
  | { action: "stop"; reason: string };

export type RuleOptions = {
  /** >1 concedes late and slowly, 1 concedes linearly, <1 concedes early. */
  toughness?: number;
  /** How many values per dimension to consider. Higher is slower but finer. */
  grid?: number;
};

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

/** Weighted distance from a package to the counterparty's last request, 0..1 per dimension. */
function distanceToTheirAsk(terms: Terms, theirAsk: Terms | undefined, dimensions: Dimension[]): number {
  if (!theirAsk) return 0;
  let total = 0;
  for (const dimension of dimensions) {
    const span = dimension.max - dimension.min || 1;
    total += Math.abs((terms[dimension.key] ?? 0) - (theirAsk[dimension.key] ?? 0)) / span;
  }
  return total / dimensions.length;
}

export function decide(view: SessionView, options: RuleOptions = {}): Decision {
  const toughness = options.toughness ?? 2.2;
  const grid = options.grid ?? 9;
  const mandate = view.yourMandate;
  const dimensions = view.itemSpec.dimensions;

  if (view.status !== "open") return { action: "stop", reason: `session is ${view.status}` };

  const standing = view.standingOffer;
  const theirs = standing && standing.fromAgentId !== view.you.agentId ? standing : undefined;
  if (standing && !theirs) return { action: "wait" };

  const ceiling = bestPossible(view, grid);
  const floor = mandate.reservationUtility;
  // How far through the negotiation we are; at the end we are down to our floor.
  const elapsed = Math.min(1, view.roundsUsed / Math.max(1, view.maxRounds - 1));
  const target = Math.max(floor, ceiling - (ceiling - floor) * Math.pow(elapsed, toughness));

  const onTheTable = theirs ? utility(theirs.terms, mandate) : -Infinity;
  if (theirs && onTheTable >= target) {
    return { action: "accept", reason: `their package is worth ${onTheTable.toFixed(3)} to me, at or above my target ${target.toFixed(3)}` };
  }

  const counter = bestCounter(view, target, grid, theirs?.terms);
  if (!counter) {
    if (theirs && onTheTable >= floor) {
      return { action: "accept", reason: `nothing better is reachable and ${onTheTable.toFixed(3)} still clears my reservation` };
    }
    return { action: "stop", reason: "no package inside my mandate is reachable" };
  }

  // Never counter with something worse for me than what is already on the table.
  if (theirs && onTheTable >= utility(counter, mandate)) {
    return { action: "accept", reason: `their package beats my own next move, so there is nothing to gain by countering` };
  }

  return {
    action: "offer",
    terms: counter,
    note: noteFor(view, counter, theirs?.terms),
    targetUtility: target,
  };
}

/**
 * Among packages worth at least `target` to us, the one closest to the
 * counterparty's last ask. Searched over a coarse grid per dimension.
 */
function bestCounter(view: SessionView, target: number, grid: number, theirAsk: Terms | undefined): Terms | undefined {
  const mandate = view.yourMandate;
  const dimensions = view.itemSpec.dimensions;
  const axes = dimensions.map((dimension) => ({
    dimension,
    values: candidates(dimension, mandate, grid, theirAsk?.[dimension.key]),
  }));
  if (axes.some((axis) => axis.values.length === 0)) return undefined;

  let best: { terms: Terms; distance: number; score: number } | undefined;
  const current: Terms = {};

  const walk = (index: number): void => {
    if (index === axes.length) {
      const score = utility(current, mandate);
      if (score < target) return;
      const distance = distanceToTheirAsk(current, theirAsk, dimensions);
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

  return best?.terms;
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
