import { describe, expect, it } from "vitest";
import { HOUSE_OWNER, outcomeOf, withMark, type SettlementMark } from "./settlement.ts";

const sides = { buyerOwnerId: "own_buyer", sellerOwnerId: "own_seller" };
const mark = (ownerId: string, choice: SettlementMark["mark"], at = "2026-11-11T00:00:00.000Z") => ({
  ownerId,
  mark: choice,
  at,
});

describe("settlement outcome", () => {
  it("stays open until someone says otherwise", () => {
    expect(outcomeOf([], sides)).toBe("open");
  });

  it("stays open on one side's word alone", () => {
    expect(outcomeOf([mark("own_buyer", "settled")], sides)).toBe("open");
  });

  it("settles only when both sides say so", () => {
    const both = [mark("own_buyer", "settled"), mark("own_seller", "settled")];
    expect(outcomeOf(both, sides)).toBe("settled");
  });

  it("lets either side alone stop it reading as done", () => {
    // A disputed deal is not a settled one, whichever side disputes it.
    expect(outcomeOf([mark("own_buyer", "settled"), mark("own_seller", "fell-through")], sides)).toBe("fell-through");
    expect(outcomeOf([mark("own_buyer", "fell-through"), mark("own_seller", "settled")], sides)).toBe("fell-through");
  });

  it("treats the house as already confirmed, since it has nothing to deliver", () => {
    const withHouse = { buyerOwnerId: "own_buyer", sellerOwnerId: HOUSE_OWNER };
    expect(outcomeOf([], withHouse)).toBe("open");
    expect(outcomeOf([mark("own_buyer", "settled")], withHouse)).toBe("settled");
    expect(outcomeOf([mark("own_buyer", "fell-through")], withHouse)).toBe("fell-through");
  });

  it("ignores a mark from somebody who is not a party", () => {
    expect(outcomeOf([mark("own_buyer", "settled"), mark("own_stranger", "settled")], sides)).toBe("open");
  });

  it("takes an owner's latest word rather than stacking it beside the old one", () => {
    let marks = withMark([], mark("own_buyer", "settled", "2026-11-11T00:00:00.000Z"));
    marks = withMark(marks, mark("own_seller", "settled", "2026-11-11T01:00:00.000Z"));
    expect(outcomeOf(marks, sides)).toBe("settled");

    // The buyer changes their mind: the deal is no longer settled, and there
    // is still only one mark from them.
    marks = withMark(marks, mark("own_buyer", "fell-through", "2026-11-12T00:00:00.000Z"));
    expect(marks.filter((m) => m.ownerId === "own_buyer")).toHaveLength(1);
    expect(outcomeOf(marks, sides)).toBe("fell-through");
  });
});
