import type { Mandate, Terms } from "./types.ts";

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * How good a single dimension's value is for this owner, on 0..1.
 * `ideal` and `worst` may be in either order, so this works for dimensions the
 * owner wants high (warranty) and low (price) alike.
 */
export function dimensionScore(value: number, ideal: number, worst: number): number {
  if (ideal === worst) return 1;
  return clamp01((value - worst) / (ideal - worst));
}

/**
 * Normalised utility (0..1) of a package of terms under a mandate's preferences.
 * Dimensions the mandate expresses no preference about do not affect the score.
 */
export function utility(terms: Terms, mandate: Mandate): number {
  const keys = Object.keys(mandate.preferences);
  let weighted = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const pref = mandate.preferences[key];
    const value = terms[key];
    if (value === undefined) continue;
    weighted += pref.weight * dimensionScore(value, pref.ideal, pref.worst);
    totalWeight += pref.weight;
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

/**
 * Joint surplus: the sum of both sides' utilities. Used by the benchmark to show
 * that a negotiated package can beat a fixed price for both parties at once.
 */
export function jointUtility(terms: Terms, a: Mandate, b: Mandate): number {
  return utility(terms, a) + utility(terms, b);
}
