/**
 * Asking an owner what they want without asking them for numbers.
 *
 * Two questions replace the builder's importance sliders and its
 * "walk away below 0.30" slider:
 *
 * 1. Which matters more? A handful of choices between two packages that differ
 *    on two terms at a time, each at its best on one and at its limit on the
 *    other. The answers sort the terms by importance (binary insertion, so
 *    four terms take at most five questions), and the order becomes weights by
 *    rank-order centroid, as conjoint analysis would.
 * 2. What will you do if this falls through? The owner describes their best
 *    alternative as a package, and the reservation value is simply what that
 *    package is worth under their own preferences.
 *
 * Like the engine, this knows nothing about any category: it needs an
 * ItemSpec and the owner's ideal and limit per term, so it works for a
 * television or a rental as it is. It calls utility() and never changes it.
 */
import { rankOrderCentroid } from "./priorities.ts";
import type { Preference, Terms } from "./types.ts";
import { utility } from "./utility.ts";

// ---------------------------------------------------------------- ranking by choice

/** Where a ranking stands: terms sorted so far, terms still to place, and the search window. */
export type Ranking = {
  ranked: string[];
  pending: string[];
  lo: number;
  hi: number;
  asked: number;
};

export function startRanking(keys: string[]): Ranking {
  if (keys.length === 0) return { ranked: [], pending: [], lo: 0, hi: 0, asked: 0 };
  return { ranked: [keys[0]], pending: keys.slice(1), lo: 0, hi: 1, asked: 0 };
}

/** The next pair to ask about, or undefined when the ranking is complete. */
export function nextComparison(state: Ranking): { candidate: string; against: string } | undefined {
  const candidate = state.pending[0];
  if (candidate === undefined) return undefined;
  return { candidate, against: state.ranked[Math.floor((state.lo + state.hi) / 2)] };
}

/** Record an answer: is the candidate term more important than the one it was compared against? */
export function answerComparison(state: Ranking, candidateMatters: boolean): Ranking {
  const candidate = state.pending[0];
  if (candidate === undefined) return state;
  const mid = Math.floor((state.lo + state.hi) / 2);
  const lo = candidateMatters ? state.lo : mid + 1;
  const hi = candidateMatters ? mid : state.hi;
  const asked = state.asked + 1;
  if (lo < hi) return { ...state, lo, hi, asked };
  const ranked = [...state.ranked.slice(0, lo), candidate, ...state.ranked.slice(lo)];
  return { ranked, pending: state.pending.slice(1), lo: 0, hi: ranked.length, asked };
}

export function isComplete(state: Ranking): boolean {
  return state.pending.length === 0;
}

/** The most questions a ranking of `n` terms can take (binary insertion). */
export function maxQuestions(n: number): number {
  let total = 0;
  for (let size = 1; size < n; size += 1) total += Math.ceil(Math.log2(size + 1));
  return total;
}

/**
 * The two packages for one question. Each is at the owner's best on one term
 * and at their limit on the other; every other term is the same in both, so
 * only these two need showing.
 */
export function comparisonPackages(
  candidate: string,
  against: string,
  anchors: Record<string, { ideal: number; limit: number }>,
): { candidateFirst: Terms; againstFirst: Terms } {
  return {
    candidateFirst: { [candidate]: anchors[candidate].ideal, [against]: anchors[against].limit },
    againstFirst: { [candidate]: anchors[candidate].limit, [against]: anchors[against].ideal },
  };
}

/** Weights for a finished ranking, scaled so the least important term weighs 1. */
export function weightsFromRanking(ranked: string[]): Record<string, number> {
  const roc = rankOrderCentroid(ranked);
  const least = roc[ranked[ranked.length - 1]] ?? 1;
  return Object.fromEntries(ranked.map((key) => [key, Number((roc[key] / least).toFixed(4))]));
}

// ---------------------------------------------------------------- how much, in money

/**
 * The smallest weight a term can get, relative to the money term. The engine
 * needs every weight positive; a term the owner says is worth nothing still
 * breaks ties.
 */
const MIN_RELATIVE_WEIGHT = 0.01;

/**
 * Weights from what each term is worth in money (swing weighting).
 *
 * An order alone cannot tell "price matters a bit more" from "price matters
 * ten times more", and that gap is enough to leave a narrow market with no
 * possible deal. So after the ranking the owner is asked, for each other term,
 * how much of the money term they would trade to move it from their limit to
 * their best: "how much more would you pay for 36 months of warranty instead
 * of 12?". The money term's own swing is its whole range, limit to best, so
 * every weight is in the same unit.
 *
 * `money` is any term measured in money (price, rent); `swings` holds an
 * amount for every other term. Returns undefined if one is missing or not a
 * finite non-negative number, so the caller falls back to the ranking.
 */
export function weightsFromSwings(
  money: string,
  swings: Record<string, number | undefined>,
  anchors: Record<string, { ideal: number; limit: number }>,
): Record<string, number> | undefined {
  const range = Math.abs(anchors[money].ideal - anchors[money].limit);
  if (!(range > 0)) return undefined;
  const weights: Record<string, number> = { [money]: 1 };
  for (const key of Object.keys(anchors)) {
    if (key === money) continue;
    const amount = swings[key];
    if (amount === undefined || !Number.isFinite(amount) || amount < 0) return undefined;
    weights[key] = Number(Math.max(amount / range, MIN_RELATIVE_WEIGHT).toFixed(4));
  }
  return weights;
}

/**
 * Pairs where the money answers contradict the choice answers: the ranking
 * says `more` matters more than `less`, but the amounts say the opposite.
 * Shown to the owner so they can look again; nothing is changed for them.
 */
export function swingConflicts(ranked: string[], weights: Record<string, number>): { more: string; less: string }[] {
  const conflicts: { more: string; less: string }[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      if (weights[ranked[j]] > weights[ranked[i]]) conflicts.push({ more: ranked[i], less: ranked[j] });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------- reservation from an alternative

/**
 * The reservation value implied by the owner's best alternative: what that
 * package is worth to them. A term the owner leaves out of the alternative
 * counts as at their limit, the cautious reading.
 */
export function reservationFromAlternative(alternative: Partial<Terms>, preferences: Record<string, Preference>): number {
  const filled: Terms = {};
  for (const [key, pref] of Object.entries(preferences)) filled[key] = alternative[key] ?? pref.worst;
  return Number(utility(filled, { preferences }).toFixed(3));
}
