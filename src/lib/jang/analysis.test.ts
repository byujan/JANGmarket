import { describe, expect, it } from "vitest";
import { classifyIssues, compromiseBenchmark, concessionSeries, loseLose, midpointPackage } from "./analysis.ts";
import { groundTruth } from "./frontier.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "./testing.ts";
import type { Offer } from "./types.ts";

const buyer = buyerMandate();
const seller = sellerMandate();
const issues = classifyIssues(testItemSpec, buyer, seller);
const byKey = (key: string) => issues.find((i) => i.key === key)!;

describe("issue types", () => {
  it("calls a term the two sides pull against distributive or integrative, never compatible", () => {
    // Both mandates care about price and want opposite ends of it.
    expect(byKey("price").kind).not.toBe("compatible");
  });

  it("separates integrative from distributive by how unequally the sides weigh it", () => {
    const lopsided = classifyIssues(
      testItemSpec,
      { ...buyer, preferences: { ...buyer.preferences, warrantyMonths: { weight: 40, ideal: 48, worst: 0 } } },
      seller,
    );
    // The buyer now spends most of its attention on warranty and the seller
    // does not, which is exactly the asymmetry a trade is made of.
    expect(lopsided.find((i) => i.key === "warrantyMonths")!.kind).toBe("integrative");
  });

  it("calls a term both sides want the same end of compatible, and names that end", () => {
    const agreeable = classifyIssues(testItemSpec, buyer, {
      ...seller,
      preferences: { ...seller.preferences, bundle: { weight: 1, ideal: 1, worst: 0 } },
    });
    const bundle = agreeable.find((i) => i.key === "bundle")!;
    expect(bundle.kind).toBe("compatible");
    expect(bundle.sharedBest).toBe(1);
  });
});

describe("lose-lose deals", () => {
  it("flags a compatible term settled away from what both sides wanted", () => {
    const compatible = [{ key: "bundle", label: "Soundbar", kind: "compatible" as const, buyerWeight: 0.1, sellerWeight: 0.1, sharedBest: 1 }];
    expect(loseLose({ bundle: 1 }, compatible)).toHaveLength(0);
    expect(loseLose({ bundle: 0 }, compatible)).toHaveLength(1);
  });

  it("says nothing about terms the two sides genuinely contest", () => {
    const contested = [{ key: "price", label: "Price", kind: "distributive" as const, buyerWeight: 0.5, sellerWeight: 0.5 }];
    expect(loseLose({ price: 1 }, contested)).toHaveLength(0);
  });
});

describe("the compromise benchmark", () => {
  it("splits every term down the middle, on the item's own step", () => {
    const mid = midpointPackage(testItemSpec);
    expect(mid.price).toBe(1750);
    expect(mid.bundle).toBe(1);
  });

  it("scores a traded package at least as well as splitting the difference", () => {
    const truth = groundTruth(testItemSpec, buyer, seller);
    const traded = truth.frontier[Math.floor(truth.frontier.length / 2)];
    const mark = compromiseBenchmark(testItemSpec, buyer, seller, truth, traded.terms);
    expect(mark.achieved).toBeGreaterThanOrEqual(mark.compromise);
    expect(mark.best).toBe(1);
  });
});

describe("concessions", () => {
  const offer = (round: number, from: string, price: number): Offer => ({
    offerId: `o${round}`,
    sessionId: "s",
    fromAgentId: from,
    round,
    terms: { price, deliveryDays: 20, warrantyMonths: 24, bundle: 0 },
    createdAt: new Date().toISOString(),
  });

  it("reads one side's own offers as falling value to itself", () => {
    const series = concessionSeries(
      [offer(1, "agent-buyer", 900), offer(2, "agent-seller", 1900), offer(3, "agent-buyer", 1100)],
      "agent-buyer",
      buyer,
    );
    expect(series.map((p) => p.round)).toEqual([1, 3]);
    expect(series[0].conceded).toBe(0);
    // A buyer paying more has given something up.
    expect(series[1].toSelf).toBeLessThan(series[0].toSelf);
    expect(series[1].conceded).toBeGreaterThan(0);
  });

  it("records no concession when a side repeats itself", () => {
    const series = concessionSeries([offer(1, "a", 900), offer(3, "a", 900)], "a", buyer);
    expect(series[1].conceded).toBe(0);
  });
});
