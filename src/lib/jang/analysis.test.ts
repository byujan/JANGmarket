import { describe, expect, it } from "vitest";
import {
  anchoring,
  classifyIssues,
  compromiseBenchmark,
  concessionSeries,
  loseLose,
  midpointPackage,
  pace,
  reversals,
} from "./analysis.ts";
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

describe("anchoring", () => {
  const offer = (round: number, from: string, price: number, at = 0): Offer => ({
    offerId: `o${round}`,
    sessionId: "s",
    fromAgentId: from,
    round,
    terms: { price, deliveryDays: 20, warrantyMonths: 24, bundle: 0 },
    createdAt: new Date(1_700_000_000_000 + at * 1000).toISOString(),
  });

  it("places the settlement between the two opening positions", () => {
    const a = anchoring(
      testItemSpec,
      [offer(1, "seller", 1900), offer(2, "buyer", 900)],
      "buyer",
      { price: 1400, deliveryDays: 20, warrantyMonths: 24, bundle: 0 },
    );
    expect(a.sellerOpen).toBe(1900);
    expect(a.buyerOpen).toBe(900);
    // 1400 is halfway from 1900 down to 900.
    expect(a.towardBuyer).toBeCloseTo(0.5, 2);
  });

  it("reads a settlement close to one opening as that side having held it", () => {
    const a = anchoring(
      testItemSpec,
      [offer(1, "seller", 1900), offer(2, "buyer", 900)],
      "buyer",
      { price: 1800, deliveryDays: 20, warrantyMonths: 24, bundle: 0 },
    );
    expect(a.towardBuyer).toBeLessThan(0.2);
  });

  it("says nothing when there is no deal to place", () => {
    expect(anchoring(testItemSpec, [offer(1, "seller", 1900)], "buyer").towardBuyer).toBeUndefined();
  });
});

describe("reversals", () => {
  const pack = (price: number, delivery: number) => ({
    price,
    deliveryDays: delivery,
    warrantyMonths: 24,
    bundle: 0,
  });
  const offer = (round: number, from: string, terms: ReturnType<typeof pack>): Offer => ({
    offerId: `o${round}`,
    sessionId: "s",
    fromAgentId: from,
    round,
    terms,
    createdAt: new Date().toISOString(),
  });

  const mandates = { seller: sellerMandate({ agentId: "seller" }), buyer: buyerMandate({ agentId: "buyer" }) };
  const parties = { buyer: "buyer", seller: "seller" };

  it("finds a package that left the other side worse off than the last one", () => {
    const found = reversals(testItemSpec, [
      // Prices stay inside the buyer's own scale: past its worst case every
      // value scores zero, and two different asks then look identical.
      offer(1, "seller", pack(1450, 30)),
      offer(2, "buyer", pack(950, 2)),
      offer(3, "seller", pack(1150, 30)), // conceded on price
      offer(4, "buyer", pack(1000, 2)),
      offer(5, "seller", pack(1350, 30)), // took it back
    ], mandates, parties);
    expect(found).toHaveLength(1);
    expect(found[0].round).toBe(5);
    expect(found[0].pulledBack.map((p) => p.key)).toContain("price");
  });

  it("says nothing about a negotiation that only ever converges", () => {
    expect(
      reversals(
        testItemSpec,
        [
          offer(1, "seller", pack(1450, 30)),
          offer(2, "buyer", pack(950, 2)),
          offer(3, "seller", pack(1300, 25)),
          offer(4, "buyer", pack(1050, 8)),
        ],
        mandates,
        parties,
      ),
    ).toHaveLength(0);
  });

  it("does not call a trade a reversal: giving up one term to take another back", () => {
    // The buyer drops the bundle and asks for more warranty. The package is
    // better for the seller overall, so nothing is flagged.
    const withTrade = (price: number, warranty: number, bundle: number): Offer => ({
      offerId: `t${warranty}${bundle}`,
      sessionId: "s",
      fromAgentId: "buyer",
      round: warranty,
      terms: { price, deliveryDays: 18, warrantyMonths: warranty, bundle },
      createdAt: new Date().toISOString(),
    });
    const found = reversals(testItemSpec, [withTrade(1000, 30, 1), withTrade(1000, 36, 0)], mandates, parties);
    expect(found).toHaveLength(0);
  });
});

describe("pace", () => {
  const offer = (round: number, from: string, at: number): Offer => ({
    offerId: `o${round}`,
    sessionId: "s",
    fromAgentId: from,
    round,
    terms: { price: 1200, deliveryDays: 20, warrantyMonths: 24, bundle: 0 },
    createdAt: new Date(1_700_000_000_000 + at * 1000).toISOString(),
  });

  it("measures the gap between offers and how much of the budget was used", () => {
    const p = pace([offer(1, "a", 0), offer(2, "b", 5), offer(3, "a", 20)], 12);
    expect(p.steps.map((s) => s.seconds)).toEqual([0, 5, 15]);
    expect(p.totalSeconds).toBe(20);
    expect(p.roundPressure).toBeCloseTo(3 / 12, 3);
  });

  it("reports a negotiation that went to the wire", () => {
    const offers = Array.from({ length: 12 }, (_, i) => offer(i + 1, i % 2 ? "a" : "b", i));
    expect(pace(offers, 12).roundPressure).toBe(1);
  });
});
