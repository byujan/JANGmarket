import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerCheck,
  answerComparison,
  comparisonPackages,
  isComplete,
  maxQuestions,
  nextCheck,
  nextComparison,
  refitCandidates,
  refittedWeights,
  reservationFromAlternative,
  startRefit,
  startRanking,
  swingConflicts,
  weightsFromRanking,
  weightsFromSwings,
} from "./elicit.ts";
import { parseScenario } from "./scenario.ts";
import { dimensionScore, utility } from "./utility.ts";

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/** Run the questions against an owner whose true order is `truth`. */
function rank(keys: string[], truth: string[]) {
  let state = startRanking(keys);
  for (let next = nextComparison(state); next; next = nextComparison(state)) {
    state = answerComparison(state, truth.indexOf(next.candidate) < truth.indexOf(next.against));
  }
  return state;
}

describe("ranking terms by choice", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    it(`recovers every possible order of ${n} terms within ${maxQuestions(n)} questions`, () => {
      const keys = ["price", "delivery", "warranty", "bundle", "deposit"].slice(0, n);
      for (const truth of permutations(keys)) {
        const state = rank(keys, truth);
        expect(isComplete(state)).toBe(true);
        expect(state.ranked).toEqual(truth);
        expect(state.asked).toBeLessThanOrEqual(maxQuestions(n));
      }
    });
  }

  it("asks at most five questions for a four-term item, against nine sliders before", () => {
    expect(maxQuestions(4)).toBe(5);
  });

  it("builds each question from the owner's best and limit on just the two terms compared", () => {
    const anchors = { price: { ideal: 900, limit: 1500 }, warranty: { ideal: 36, limit: 0 } };
    expect(comparisonPackages("price", "warranty", anchors)).toEqual({
      candidateFirst: { price: 900, warranty: 0 },
      againstFirst: { price: 1500, warranty: 36 },
    });
  });

  it("turns an order into positive weights, most important heaviest", () => {
    const weights = weightsFromRanking(["price", "warranty", "delivery", "bundle"]);
    expect(weights.price).toBeGreaterThan(weights.warranty);
    expect(weights.warranty).toBeGreaterThan(weights.delivery);
    expect(weights.delivery).toBeGreaterThan(weights.bundle);
    expect(weights.bundle).toBe(1);
  });
});

describe("weights from what each term is worth in money", () => {
  const anchors = {
    price: { ideal: 999, limit: 1300 },
    deliveryDays: { ideal: 3, limit: 30 },
    warrantyMonths: { ideal: 36, limit: 12 },
    bundle: { ideal: 1, limit: 0 },
  };

  it("recovers an owner's exact preferences from honest answers", () => {
    // True weights, and what each swing is worth in dollars to that owner.
    const truth: Record<string, number> = { price: 5, deliveryDays: 1, warrantyMonths: 3, bundle: 1.5 };
    const swing = (k: keyof typeof truth) => (truth[k] / truth.price) * 301;
    const weights = weightsFromSwings("price", { deliveryDays: swing("deliveryDays"), warrantyMonths: swing("warrantyMonths"), bundle: swing("bundle") }, anchors)!;
    const prefs = (w: Record<string, number>) =>
      Object.fromEntries(Object.entries(anchors).map(([k, a]) => [k, { weight: w[k], ideal: a.ideal, worst: a.limit }]));
    for (const terms of [
      { price: 1100, deliveryDays: 10, warrantyMonths: 24, bundle: 0 },
      { price: 1250, deliveryDays: 25, warrantyMonths: 36, bundle: 1 },
    ]) {
      expect(utility(terms, { preferences: prefs(weights) })).toBeCloseTo(utility(terms, { preferences: prefs(truth) }), 3);
    }
  });

  it("lets a term outweigh the money term when it is worth more than the whole price range", () => {
    const weights = weightsFromSwings("price", { deliveryDays: 600, warrantyMonths: 50, bundle: 0 }, anchors)!;
    expect(weights.deliveryDays).toBeGreaterThan(weights.price);
  });

  it("keeps a term worth nothing positive, as the engine requires", () => {
    expect(weightsFromSwings("price", { deliveryDays: 0, warrantyMonths: 50, bundle: 0 }, anchors)!.bundle).toBeGreaterThan(0);
  });

  it("falls back (undefined) until every other term has a usable amount", () => {
    expect(weightsFromSwings("price", { deliveryDays: 40, warrantyMonths: 50 }, anchors)).toBeUndefined();
    expect(weightsFromSwings("price", { deliveryDays: 40, warrantyMonths: -5, bundle: 0 }, anchors)).toBeUndefined();
    expect(weightsFromSwings("price", { deliveryDays: Number.NaN, warrantyMonths: 5, bundle: 0 }, anchors)).toBeUndefined();
  });

  it("flags only the pairs where the amounts contradict the choices", () => {
    const weights = { price: 1, warrantyMonths: 0.5, deliveryDays: 0.6, bundle: 0.1 };
    expect(swingConflicts(["price", "warrantyMonths", "deliveryDays", "bundle"], weights)).toEqual([{ more: "warrantyMonths", less: "deliveryDays" }]);
    expect(swingConflicts(["price", "deliveryDays", "warrantyMonths", "bundle"], weights)).toEqual([]);
  });
});

describe("reservation from the owner's alternative", () => {
  const tv = parseScenario(JSON.parse(readFileSync("agents/scenarios/tv-clearance.json", "utf8")));
  const preferences = tv.buyer.preferences;

  it("is what the alternative is worth under the owner's own preferences", () => {
    const elsewhere = { price: 1280, warrantyMonths: 12, deliveryDays: 7, bundle: 0 };
    expect(reservationFromAlternative(elsewhere, preferences)).toBeCloseTo(utility(elsewhere, { preferences }), 3);
  });

  it("counts a term left out as at the owner's limit", () => {
    const partial = { price: 1280, warrantyMonths: 12, deliveryDays: 7 };
    const worstBundle = { ...partial, bundle: preferences.bundle.worst };
    expect(reservationFromAlternative(partial, preferences)).toBeCloseTo(utility(worstBundle, { preferences }), 3);
  });

  it("is 0 for an alternative at every limit and 1 for one at every ideal", () => {
    const atLimits = Object.fromEntries(Object.entries(preferences).map(([k, p]) => [k, p.worst]));
    const atIdeals = Object.fromEntries(Object.entries(preferences).map(([k, p]) => [k, p.ideal]));
    expect(reservationFromAlternative(atLimits, preferences)).toBe(0);
    expect(reservationFromAlternative(atIdeals, preferences)).toBe(1);
  });
});

describe("refitting weights from a few yes/no checks", () => {
  const anchors: Record<string, { ideal: number; limit: number; step: number }> = {
    price: { ideal: 900, limit: 1500, step: 50 },
    deliveryDays: { ideal: 1, limit: 14, step: 1 },
    warrantyMonths: { ideal: 36, limit: 0, step: 6 },
    bundle: { ideal: 1, limit: 0, step: 1 },
  };
  const prefs = Object.fromEntries(Object.entries(anchors).map(([k, a]) => [k, { ideal: a.ideal, worst: a.limit }]));
  const truth = { price: 1, deliveryDays: 0.3, warrantyMonths: 0.5, bundle: 0.2 };
  // Overstates warranty by 1.5x and understates delivery by 0.6x.
  const base = { price: 1, deliveryDays: 0.18, warrantyMonths: 0.75, bundle: 0.2 };
  const alternative: Record<string, number> = { price: 1200, deliveryDays: 7, warrantyMonths: 12, bundle: 0 };
  const candidates = refitCandidates(anchors);
  const norm = (w: Record<string, number>) => {
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
  };
  const l1 = (a: Record<string, number>, b: Record<string, number>) => {
    const x = norm(a), y = norm(b);
    return Object.keys(x).reduce((sum, k) => sum + Math.abs(x[k] - y[k]), 0);
  };
  const trueUtility = (pkg: Record<string, number>) => {
    const w = norm(truth);
    return Object.keys(truth).reduce((s, k) => s + w[k] * dimensionScore(pkg[k], anchors[k].ideal, anchors[k].limit), 0);
  };

  it("builds a grid with deduplicated values", () => {
    expect(candidates.length).toBeGreaterThan(100);
    expect(refitCandidates({ bundle: { ideal: 1, limit: 0, step: 1 } })).toEqual([{ bundle: 0 }, { bundle: 1 }]);
  });

  it("moves the weights toward the truth after three truthful answers", () => {
    let state = startRefit(base, undefined);
    for (let round = 0; round < 3; round += 1) {
      const pkg = nextCheck(state, candidates, alternative, prefs);
      expect(pkg).toBeDefined();
      state = answerCheck(state, pkg!, alternative, prefs, trueUtility(pkg!) >= trueUtility(alternative));
    }
    expect(state.answered).toBe(3);
    expect(l1(refittedWeights(state), truth)).toBeLessThan(l1(base, truth));
  });

  it("never repeats a package and stays near the line", () => {
    let state = startRefit(base, undefined);
    const seen = new Set<string>();
    for (let round = 0; round < 6; round += 1) {
      const pkg = nextCheck(state, candidates, alternative, prefs);
      if (!pkg) break;
      const key = JSON.stringify(pkg);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const est = refittedWeights(state);
      const total = Object.values(est).reduce((a, b) => a + b, 0);
      const gap = Object.keys(est).reduce(
        (s, k) => s + (est[k] / total) * (dimensionScore(pkg[k], prefs[k].ideal, prefs[k].worst) - dimensionScore(alternative[k], prefs[k].ideal, prefs[k].worst)),
        0,
      );
      expect(Math.abs(gap)).toBeLessThanOrEqual(0.05 + 1e-3);
      state = answerCheck(state, pkg, alternative, prefs, round % 2 === 0);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("falls back to the base weights when the order contradicts every sample", () => {
    // Base says price > warranty > delivery > bundle; the order claims the reverse by a wide margin.
    const wide = { price: 100, deliveryDays: 10, warrantyMonths: 1, bundle: 0.01 };
    const state = startRefit(wide, ["bundle", "warrantyMonths", "deliveryDays", "price"], { noise: 0.01 });
    expect(state.samples).toHaveLength(1);
    expect(refittedWeights(state)).toEqual(wide);
  });

  it("stays close to the base with no answers", () => {
    const state = startRefit(base, undefined);
    expect(l1(refittedWeights(state), base)).toBeLessThan(0.15);
    expect(Object.values(refittedWeights(state)).every((w) => w > 0)).toBe(true);
  });
});
