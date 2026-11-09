import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groundTruth, quality } from "./frontier.ts";
import { issueMandate, parseScenario } from "./scenario.ts";
import { ItemSpecSchema } from "./types.ts";

const load = (name: string) => parseScenario(JSON.parse(readFileSync(`agents/scenarios/${name}.json`, "utf8")));

describe("the Pareto frontier", () => {
  const tv = load("tv-clearance");
  const buyer = issueMandate(tv, "buyer");
  const seller = issueMandate(tv, "seller");
  const truth = groundTruth(tv.itemSpec, buyer, seller);

  it("finds feasible packages and a frontier in the shipped market", () => {
    expect(truth.feasible.length).toBeGreaterThan(0);
    expect(truth.frontier.length).toBeGreaterThan(0);
    expect(truth.maxSurplus).toBeGreaterThan(0);
  });

  it("keeps only points no feasible package dominates", () => {
    for (const point of truth.frontier) {
      expect(quality(point.terms, buyer, seller, truth).paretoOptimal).toBe(true);
      expect(quality(point.terms, buyer, seller, truth).paretoDistance).toBe(0);
    }
  });

  it("scores the best joint package at full efficiency", () => {
    const best = truth.feasible.reduce((a, p) =>
      p.buyer - buyer.reservationUtility + p.seller - seller.reservationUtility >
      a.buyer - buyer.reservationUtility + a.seller - seller.reservationUtility
        ? p
        : a,
    );
    expect(quality(best.terms, buyer, seller, truth).efficiency).toBeCloseTo(1, 9);
  });

  it("is fast enough at the five-term cap to compute when a session opens", () => {
    const rental = load("cambridge-rental");
    expect(rental.itemSpec.dimensions).toHaveLength(5);
    const started = performance.now();
    groundTruth(rental.itemSpec, issueMandate(rental, "buyer"), issueMandate(rental, "seller"));
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("refuses an item with more than five negotiable terms", () => {
    const six = { ...tv.itemSpec, dimensions: [...tv.itemSpec.dimensions, ...tv.itemSpec.dimensions.slice(0, 2).map((d) => ({ ...d, key: `${d.key}2` }))] };
    expect(six.dimensions).toHaveLength(6);
    expect(ItemSpecSchema.safeParse(six).success).toBe(false);
  });
});
