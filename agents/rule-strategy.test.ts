/**
 * Scarcity strengthens the side that has it, from what that side knows about
 * itself. An agent is never told how many others its counterparty is
 * negotiating with, so nothing here makes a buyer concede faster.
 */
import { describe, expect, it } from "vitest";
import { MAX_LEVERAGE, candidates, decide, marketLeverage } from "./rule-strategy.ts";
import { sellerMandate, testItemSpec } from "../src/lib/jang/testing.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Market } from "../src/lib/jang/types.ts";

const view = (market?: Market): SessionView =>
  ({ market }) as unknown as SessionView;

describe("market leverage", () => {
  it("is nothing with no more counterparties than units", () => {
    expect(marketLeverage(view({ remaining: 1, authorised: 1, openSessions: 1 }))).toBe(0);
    expect(marketLeverage(view({ remaining: 4, authorised: 4, openSessions: 3 }))).toBe(0);
  });

  it("rises with counterparties per unit, up to a cap", () => {
    const two = marketLeverage(view({ remaining: 1, authorised: 1, openSessions: 2 }));
    const six = marketLeverage(view({ remaining: 1, authorised: 1, openSessions: 6 }));
    const many = marketLeverage(view({ remaining: 1, authorised: 1, openSessions: 500 }));
    expect(two).toBeGreaterThan(0);
    expect(six).toBeGreaterThan(two);
    expect(many).toBeLessThanOrEqual(MAX_LEVERAGE);
  });

  it("falls as more units go round", () => {
    const scarce = marketLeverage(view({ remaining: 1, authorised: 1, openSessions: 4 }));
    const plenty = marketLeverage(view({ remaining: 3, authorised: 3, openSessions: 4 }));
    expect(plenty).toBeLessThan(scarce);
  });
});

describe("decide under contest", () => {
  const seller = sellerMandate();
  const session = (market: Market | undefined, roundsUsed: number) =>
    ({
      status: "open",
      you: { agentId: seller.agentId, role: "seller" },
      itemSpec: testItemSpec,
      yourMandate: seller,
      offers: [],
      roundsUsed,
      maxRounds: 12,
      market,
    }) as unknown as SessionView;
  const targetOf = (market: Market | undefined, roundsUsed: number) => {
    const decision = decide(session(market, roundsUsed));
    if (decision.action !== "offer") throw new Error(`expected an offer, got ${decision.action}`);
    return decision.targetUtility;
  };

  it("holds out longer with more buyers than units", () => {
    const alone = targetOf({ remaining: 1, authorised: 1, openSessions: 1 }, 6);
    const courted = targetOf({ remaining: 1, authorised: 1, openSessions: 6 }, 6);
    expect(courted).toBeGreaterThan(alone);
  });

  it("still comes down to its floor by the last round", () => {
    const courted = targetOf({ remaining: 1, authorised: 1, openSessions: 6 }, 11);
    expect(courted).toBeCloseTo(seller.reservationUtility, 6);
  });

  it("concedes on the usual schedule in a negotiation of one", () => {
    // The bug this replaced read an agent's own sessions as rivals. One session
    // for one unit is neither leverage nor pressure.
    const alone = targetOf({ remaining: 1, authorised: 1, openSessions: 1 }, 6);
    expect(alone).toBeCloseTo(targetOf(undefined, 6), 12);
  });
});

describe("candidate values", () => {
  // HW9: JANG now refuses off-grid terms, so an owner's bound between grid
  // points must not leak into an offer.
  it("stay on the item's grid even when the owner's bound is between grid points", () => {
    const price = testItemSpec.dimensions.find((d) => d.key === "price")!;
    const mandate = sellerMandate({
      constraints: { price: { min: 1185, max: 1497 } },
      preferences: { price: { weight: 5, ideal: 1349, worst: 1185 } },
    });
    const values = candidates(price, mandate, 7, 1263);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect((value - price.min) % price.step).toBe(0);
      expect(value).toBeGreaterThanOrEqual(1190);
      expect(value).toBeLessThanOrEqual(1490);
    }
  });
});
