import { describe, expect, it } from "vitest";
import { askingOnLattice, niceStep, priceDimension } from "./asking.ts";
import { houseMandateBody } from "./listing.ts";

describe("asking price to a negotiable band", () => {
  it("names a step a person would say out loud", () => {
    expect(niceStep(500)).toBe(5);
    expect(niceStep(40_000)).toBe(500);
    expect(niceStep(12)).toBe(1);
  });

  it("puts the asking price itself on the lattice", () => {
    // A listing whose own asking price is not a legal offer contradicts itself.
    for (const asking of [12, 85, 500, 1234, 40_000]) {
      const dimension = priceDimension(asking);
      const onLattice = askingOnLattice(asking);
      expect(onLattice).toBeGreaterThanOrEqual(dimension.min);
      expect(onLattice).toBeLessThanOrEqual(dimension.max);
      expect((onLattice - dimension.min) % dimension.step).toBe(0);
      // And it is still recognisably the number that was typed.
      expect(Math.abs(onLattice - asking) / asking).toBeLessThan(0.02);
    }
  });

  it("leaves room on both sides of the asking price", () => {
    const d = priceDimension(500);
    expect(d.min).toBeLessThan(500);
    expect(d.max).toBeGreaterThan(500);
  });

  it("never produces a band with nowhere to move", () => {
    for (const asking of [1, 2, 5, 9, 100, 999_999]) {
      const d = priceDimension(asking);
      expect(d.max).toBeGreaterThan(d.min);
      expect(d.step).toBeLessThanOrEqual(d.max - d.min);
      expect(d.min).toBeGreaterThan(0);
    }
  });

  it("leaves the derived counterparty able to come within a point of the asking price", () => {
    // The band is only useful if the house JANG invents from it can almost
    // meet the ask: close enough that a deal is there, short enough that the
    // lister has to concede something and the negotiation is not theatre.
    for (const asking of [85, 500, 40_000]) {
      const itemSpec = { itemId: "item_ask", title: "Road bike", dimensions: [priceDimension(asking)] };
      const house = houseMandateBody({
        itemSpec,
        listedRole: "seller",
        agentId: "house-ask",
        ownerId: "jang-house",
        mandateId: "mdt_house_ask",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(house.role).toBe("buyer");

      const ceiling = house.constraints.price?.max;
      expect(ceiling).toBeDefined();
      expect(ceiling!).toBeLessThan(askingOnLattice(asking));
      expect(ceiling! / asking).toBeGreaterThan(0.95);
    }
  });

  it("puts the house on the selling side when the listing is a wanted ad", () => {
    const itemSpec = { itemId: "item_want", title: "Wanted: road bike", dimensions: [priceDimension(500)] };
    const house = houseMandateBody({
      itemSpec,
      listedRole: "buyer",
      agentId: "house-want",
      ownerId: "jang-house",
      mandateId: "mdt_house_want",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(house.role).toBe("seller");
    // Selling, it holds a floor rather than a ceiling, and the floor sits
    // below what the buyer offered, so there is a deal to be had.
    expect(house.constraints.price?.min).toBeDefined();
    expect(house.constraints.price!.min!).toBeLessThan(500);
  });

});
