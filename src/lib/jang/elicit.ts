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
import { dimensionScore, utility } from "./utility.ts";

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

// ---------------------------------------------------------------- refit the weights from a few yes/no checks

/** Small seeded generator (mulberry32), so a refit is repeatable. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * What is still believed about the weights: sampled weight vectors (in the
 * order of `keys`), how plausible each one still is, and which packages were
 * already asked about.
 */
export type Refit = {
  keys: string[];
  samples: number[][];
  importance: number[];
  asked: string[];
  answered: number;
};

const REFIT_SAMPLES = 200;
const REFIT_NOISE = 0.3;
const REFIT_SEED = 20260101;
const REFIT_BAND = 0.05;
const MIN_REFIT_WEIGHT = 0.0001;

/**
 * Start from the weights the owner gave, treated as noisy: draw `samples`
 * vectors w_k = base_k * exp(noise * z). When `order` (most important first)
 * is complete, samples that break it are ruled out; if that rules out all of
 * them, only the base weights are kept.
 */
export function startRefit(
  base: Record<string, number>,
  order: string[] | undefined,
  options: { samples?: number; noise?: number; seed?: number } = {},
): Refit {
  const keys = Object.keys(base);
  const count = options.samples ?? REFIT_SAMPLES;
  const noise = options.noise ?? REFIT_NOISE;
  const rand = seededRandom(options.seed ?? REFIT_SEED);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const samples = Array.from({ length: count }, () => keys.map((key) => base[key] * Math.exp(noise * normal())));
  const complete = order !== undefined && order.length === keys.length && keys.every((key) => order.includes(key));
  const respects = (w: number[]) => {
    if (!complete) return true;
    const at = (key: string) => w[keys.indexOf(key)];
    return order.every((key, i) => i === 0 || at(order[i - 1]) >= at(key));
  };
  const importance = samples.map((w) => (respects(w) ? 1 : 0));
  if (importance.every((x) => x === 0)) {
    return { keys, samples: [keys.map((key) => base[key])], importance: [1], asked: [], answered: 0 };
  }
  return { keys, samples, importance, asked: [], answered: 0 };
}

/**
 * Every package on a grid: each term at `perTerm` evenly spaced values from
 * its limit to its ideal, snapped to its step. Duplicates collapse, so a
 * yes/no term gives two values.
 */
export function refitCandidates(
  anchors: Record<string, { ideal: number; limit: number; step: number }>,
  perTerm = 5,
): Terms[] {
  let grid: Terms[] = [{}];
  for (const [key, a] of Object.entries(anchors)) {
    const values = new Set<number>();
    for (let i = 0; i < perTerm; i += 1) {
      const raw = perTerm === 1 ? a.limit : a.limit + ((a.ideal - a.limit) * i) / (perTerm - 1);
      const snapped = a.step > 0 ? Math.round(raw / a.step) * a.step : raw;
      values.add(Number(snapped.toFixed(6)));
    }
    grid = grid.flatMap((t) => [...values].map((v) => ({ ...t, [key]: v })));
  }
  return grid;
}

function packageKey(pkg: Terms): string {
  return JSON.stringify(Object.entries(pkg).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Per-term score gap between a package and the alternative, in the order of `keys`. */
function scoreGaps(keys: string[], pkg: Terms, alternative: Terms, prefs: Record<string, { ideal: number; worst: number }>): number[] {
  return keys.map((key) => {
    const p = prefs[key];
    return dimensionScore(pkg[key] ?? p.worst, p.ideal, p.worst) - dimensionScore(alternative[key] ?? p.worst, p.ideal, p.worst);
  });
}

function estimate(state: Refit): number[] {
  const est = state.keys.map(() => 0);
  let total = 0;
  state.samples.forEach((w, m) => {
    const imp = state.importance[m];
    if (!imp) return;
    total += imp;
    w.forEach((x, t) => {
      est[t] += imp * x;
    });
  });
  return est.map((x) => (total > 0 ? x / total : 0));
}

/**
 * The next package worth asking about: one the current estimate puts within
 * 0.05 of the alternative, and which the plausible weights split closest to
 * half and half on whether it beats the alternative. Undefined when none is left.
 */
export function nextCheck(
  state: Refit,
  candidates: Terms[],
  alternative: Terms,
  preferences: Record<string, { ideal: number; worst: number }>,
): Terms | undefined {
  const est = estimate(state);
  const sumW = est.reduce((a, b) => a + b, 0);
  const totalImp = state.importance.reduce((a, b) => a + b, 0);
  if (!(sumW > 0) || !(totalImp > 0)) return undefined;
  const asked = new Set(state.asked);
  let pick: Terms | undefined;
  let bestGap = Infinity;
  for (const pkg of candidates) {
    if (asked.has(packageKey(pkg))) continue;
    const gaps = scoreGaps(state.keys, pkg, alternative, preferences);
    const now = gaps.reduce((acc, g, t) => acc + est[t] * g, 0) / sumW;
    if (Math.abs(now) > REFIT_BAND) continue;
    let yes = 0;
    state.samples.forEach((w, m) => {
      if (verdict(w, gaps)) yes += state.importance[m];
    });
    const gap = Math.abs(yes / totalImp - 0.5);
    if (gap < bestGap) {
      bestGap = gap;
      pick = pkg;
    }
  }
  return pick;
}

function verdict(w: number[], gaps: number[]): boolean {
  let v = 0;
  for (let t = 0; t < w.length; t += 1) v += w[t] * gaps[t];
  return v >= -1e-9;
}

/** Record the owner's answer: samples that agree keep their weight, the rest lose most of it. */
export function answerCheck(
  state: Refit,
  pkg: Terms,
  alternative: Terms,
  preferences: Record<string, { ideal: number; worst: number }>,
  wouldTake: boolean,
): Refit {
  const gaps = scoreGaps(state.keys, pkg, alternative, preferences);
  return {
    ...state,
    importance: state.importance.map((imp, m) => imp * (verdict(state.samples[m], gaps) === wouldTake ? 0.95 : 0.05)),
    asked: [...state.asked, packageKey(pkg)],
    answered: state.answered + 1,
  };
}

/** The weights now believed: importance-weighted mean, rounded, and always above zero. */
export function refittedWeights(state: Refit): Record<string, number> {
  const est = estimate(state);
  return Object.fromEntries(state.keys.map((key, t) => [key, Math.max(Number(est[t].toFixed(4)), MIN_REFIT_WEIGHT)]));
}
