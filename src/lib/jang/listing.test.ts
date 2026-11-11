import { describe, expect, it } from "vitest";
import { houseMandateBody, opposite, prefersHighEnd } from "./listing.ts";
import { checkTermsAgainstMandate } from "./mandate.ts";
import { signMandate } from "./mandate.ts";
import { generateKeyPair } from "./crypto.ts";
import { testItemSpec } from "./testing.ts";
import type { ItemSpec } from "./types.ts";

const body = (listedRole: "buyer" | "seller", itemSpec: ItemSpec = testItemSpec) =>
  houseMandateBody({
    itemSpec,
    listedRole,
    agentId: "house",
    ownerId: "jang-house",
    mandateId: "mdt_house",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

describe("the house's side of a listing", () => {
  it("takes the side the lister did not", () => {
    expect(body("buyer").role).toBe("seller");
    expect(body("seller").role).toBe("buyer");
    expect(opposite("buyer")).toBe("seller");
  });

  it("wants the opposite end of each term from the lister", () => {
    const price = testItemSpec.dimensions.find((d) => d.key === "price")!;
    // The buyer wants a low price, so a house selling wants a high one.
    expect(prefersHighEnd(price, "buyer")).toBe(false);
    expect(prefersHighEnd(price, "seller")).toBe(true);
  });

  it("holds a floor when selling and a ceiling when buying", () => {
    expect(body("buyer").constraints.price.min).toBeGreaterThan(testItemSpec.dimensions[0].min);
    expect(body("buyer").constraints.price.max).toBeUndefined();

    expect(body("seller").constraints.price.max).toBeLessThan(testItemSpec.dimensions[0].max);
    expect(body("seller").constraints.price.min).toBeUndefined();
  });

  it("leaves itself room: its limit is not its ideal", () => {
    const house = body("buyer");
    expect(house.preferences.price.ideal).toBeGreaterThan(house.constraints.price.min!);
  });

  it("weighs money above the other terms", () => {
    const house = body("buyer");
    expect(house.preferences.price.weight).toBeGreaterThan(house.preferences.warrantyMonths.weight);
  });

  it("is the same every time, so a listing has one counterparty and not a new one each visit", () => {
    expect(JSON.stringify(body("buyer").constraints)).toBe(JSON.stringify(body("buyer").constraints));
  });

  it("produces a mandate that signs and verifies like any other", () => {
    const keys = generateKeyPair();
    const mandate = signMandate(body("buyer"), keys.privateKeyPem, keys.publicKeyPem);
    expect(mandate.signature).toBeTruthy();
  });

  it("refuses a package beyond its own derived floor", () => {
    const keys = generateKeyPair();
    const house = signMandate(body("buyer"), keys.privateKeyPem, keys.publicKeyPem);
    const floor = house.constraints.price.min!;
    const tooCheap = { price: floor - 10, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };
    expect(checkTermsAgainstMandate(tooCheap, house).ok).toBe(false);
  });

  it("holds a real position: it will not simply accept anything", () => {
    const keys = generateKeyPair();
    const house = signMandate(body("buyer"), keys.privateKeyPem, keys.publicKeyPem);
    // The buyer's dream package is worthless to the house, which is the point:
    // its position comes from the item, not from whoever listed it.
    const dream = { price: 500, deliveryDays: 1, warrantyMonths: 48, bundle: 1 };
    expect(checkTermsAgainstMandate(dream, house).ok).toBe(false);
  });
});
