import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerComparison,
  comparisonPackages,
  isComplete,
  maxQuestions,
  nextComparison,
  reservationFromAlternative,
  startRanking,
  weightsFromRanking,
} from "./elicit.ts";
import { parseScenario } from "./scenario.ts";
import { utility } from "./utility.ts";

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
