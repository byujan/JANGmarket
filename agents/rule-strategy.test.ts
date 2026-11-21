/**
 * Competition should hurry an agent, not panic it.
 *
 * The pressure comes only from how many rivals there are against how many
 * units remain, both of which the market view already carries. No rival's
 * limits are involved.
 */
import { describe, expect, it } from "vitest";
import { MAX_COMPETITIVE_PRESSURE, candidates, competitivePressure, decide } from "./rule-strategy.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "../src/lib/jang/testing.ts";
import { utility } from "../src/lib/jang/utility.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Market } from "../src/lib/jang/types.ts";

const view = (market?: Market): SessionView =>
  ({ market }) as unknown as SessionView;

describe("competitive pressure", () => {
  it("is nothing when an agent is the only one negotiating", () => {
    expect(competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 1 }))).toBe(0);
  });

  it("is nothing when the market is not reported at all", () => {
    expect(competitivePressure(view())).toBe(0);
  });

  it("rises with the number of rivals for a single unit", () => {
    const two = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 2 }));
    const five = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 5 }));
    expect(two).toBeGreaterThan(0);
    expect(five).toBeGreaterThan(two);
  });

  it("falls as more units become available to go round", () => {
    const scarce = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 4 }));
    const plenty = competitivePressure(view({ remaining: 8, authorised: 8, openSessions: 4 }));
    expect(plenty).toBeLessThan(scarce);
  });

  it("never exceeds the cap, however many rivals arrive", () => {
    const crowded = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 500 }));
    expect(crowded).toBeLessThanOrEqual(MAX_COMPETITIVE_PRESSURE);
    expect(crowded).toBeGreaterThan(0.4);
  });

  it("leaves a single rival uncomfortable rather than desperate", () => {
    // One other bidder for one unit should hurry an agent, not fold it.
    const one = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 2 }));
    expect(one).toBeGreaterThan(0.1);
    expect(one).toBeLessThan(0.25);
  });

  it("is nothing once an agent has nothing left to commit", () => {
    expect(competitivePressure(view({ remaining: 0, authorised: 1, openSessions: 6 }))).toBe(0);
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

describe("endgame", () => {
  // A seller on its last offer, answering a buyer who asked for a short
  // delivery, a long warranty and the soundbar at 1,300.
  const seller = sellerMandate();
  const buyer = buyerMandate();
  const ask = { price: 1300, deliveryDays: 10, warrantyMonths: 12, bundle: 1 };
  const offer = (fromAgentId: string, terms: Record<string, number>, round: number) => ({
    offerId: `o${round}`,
    sessionId: "s",
    fromAgentId,
    round,
    terms,
    createdAt: new Date().toISOString(),
  });
  const at = (roundsUsed: number) =>
    ({
      status: "open",
      you: { agentId: seller.agentId, role: "seller" },
      counterparty: { agentId: buyer.agentId, role: "buyer" },
      itemSpec: testItemSpec,
      yourMandate: seller,
      maxRounds: 12,
      roundsUsed,
      offers: [offer(seller.agentId, { price: 1500, deliveryDays: 30, warrantyMonths: 6, bundle: 0 }, roundsUsed - 2), offer(buyer.agentId, ask, roundsUsed - 1)],
      standingOffer: offer(buyer.agentId, ask, roundsUsed - 1),
    }) as unknown as SessionView;
  const terms = (view: SessionView, endgame: boolean) => {
    const decision = decide(view, { toughness: 1.6, respectBounds: true, endgame });
    if (decision.action !== "offer") throw new Error(`expected an offer, got ${decision.action}`);
    return decision.terms;
  };

  it("on the last offer, gives the counterparty more without going below its own floor", () => {
    const nearest = terms(at(11), false);
    const last = terms(at(11), true);
    expect(utility(last, buyer)).toBeGreaterThan(utility(nearest, buyer));
    expect(utility(last, seller)).toBeGreaterThanOrEqual(seller.reservationUtility);
  });

  it("is never worse for them on any term than the nearest package", () => {
    const nearest = terms(at(11), false);
    const last = terms(at(11), true);
    // The buyer wants price and delivery down, warranty and the soundbar up.
    expect(last.price).toBeLessThanOrEqual(nearest.price);
    expect(last.deliveryDays).toBeLessThanOrEqual(nearest.deliveryDays);
    expect(last.warrantyMonths).toBeGreaterThanOrEqual(nearest.warrantyMonths);
    expect(last.bundle).toBeGreaterThanOrEqual(nearest.bundle);
  });

  it("changes nothing before the last offer", () => {
    expect(terms(at(6), true)).toEqual(terms(at(6), false));
  });

  it("is not fooled when the buyer has already conceded past the seller on a term", () => {
    // The seller last offered 6 days; the buyer, conceding, now asks for 11.
    // Reading the gap, the seller would conclude the buyer wants delivery
    // later, and "give" it a later one. The buyer wants it sooner.
    const crossed = {
      ...at(11),
      offers: [
        offer(seller.agentId, { price: 1500, deliveryDays: 6, warrantyMonths: 6, bundle: 0 }, 9),
        offer(buyer.agentId, { price: 1300, deliveryDays: 11, warrantyMonths: 12, bundle: 1 }, 10),
      ],
      standingOffer: offer(buyer.agentId, { price: 1300, deliveryDays: 11, warrantyMonths: 12, bundle: 1 }, 10),
    } as unknown as SessionView;
    const pick = (endgameDirections?: "asks" | "opposed") => {
      const decision = decide(crossed, { toughness: 1.6, respectBounds: true, endgame: true, endgameDirections });
      if (decision.action !== "offer") throw new Error(`expected an offer, got ${decision.action}`);
      return decision.terms;
    };
    const nearest = (() => {
      const decision = decide(crossed, { toughness: 1.6, respectBounds: true });
      if (decision.action !== "offer") throw new Error(`expected an offer, got ${decision.action}`);
      return decision.terms;
    })();

    // The first version moves delivery the wrong way, and the buyer loses by it.
    expect(pick("asks").deliveryDays).toBeGreaterThan(nearest.deliveryDays);
    // Opposed directions never lengthen it, and leave the buyer better off.
    expect(pick("opposed").deliveryDays).toBeLessThanOrEqual(nearest.deliveryDays);
    expect(utility(pick("opposed"), buyer)).toBeGreaterThanOrEqual(utility(nearest, buyer));
    expect(utility(pick("opposed"), seller)).toBeGreaterThanOrEqual(seller.reservationUtility);
  });
});
