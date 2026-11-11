/**
 * Whose side is whose.
 *
 * The rule is small and was wrong once: a person selling a bike must negotiate
 * as the seller, not end up buying their own bike from the house.
 */
import { describe, expect, it } from "vitest";
import { roleFor, type CatalogueEntry } from "./marketplace.ts";

const spec = { itemId: "item_bike", title: "Road bike", dimensions: [] };

const listed = (listedRole: "buyer" | "seller", listedBy: string): CatalogueEntry => ({
  itemSpec: spec,
  title: "Road bike",
  listedRole,
  listedBy,
  source: "listed",
});

const builtIn: CatalogueEntry = { itemSpec: spec, title: "Clearance TV", source: "built-in" };

describe("the side an owner takes", () => {
  it("keeps the lister on the side they listed", () => {
    expect(roleFor(listed("seller", "own_me"), "own_me")).toBe("seller");
    expect(roleFor(listed("buyer", "own_me"), "own_me")).toBe("buyer");
  });

  it("gives anyone else the side left open", () => {
    expect(roleFor(listed("seller", "own_them"), "own_me")).toBe("buyer");
    expect(roleFor(listed("buyer", "own_them"), "own_me")).toBe("seller");
  });

  it("leaves a built-in market to choose for itself", () => {
    expect(roleFor(builtIn, "own_me")).toBeUndefined();
  });
});
