import { describe, expect, it } from "vitest";
import { checkTermsAgainstMandate, verifyMandate } from "./mandate.ts";
import { buyerMandate, sellerMandate } from "./testing.ts";

const insideBoth = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

describe("mandate authority", () => {
  it("accepts a package inside the owner's bounds", () => {
    expect(checkTermsAgainstMandate(insideBoth, buyerMandate()).ok).toBe(true);
    expect(checkTermsAgainstMandate(insideBoth, sellerMandate()).ok).toBe(true);
  });

  it("rejects a price above the buyer's hard ceiling", () => {
    const check = checkTermsAgainstMandate({ ...insideBoth, price: 1600 }, buyerMandate());
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.violations).toContainEqual(
      expect.objectContaining({ dimension: "price", limit: 1500, offered: 1600 }),
    );
  });

  it("rejects a price below the seller's hard floor", () => {
    const check = checkTermsAgainstMandate({ ...insideBoth, price: 1100 }, sellerMandate());
    expect(check.ok).toBe(false);
  });

  it("rejects a package worth less than the reservation value", () => {
    // Inside every hard bound, but barely worth anything to the buyer.
    const check = checkTermsAgainstMandate(
      { price: 1500, deliveryDays: 30, warrantyMonths: 0, bundle: 0 },
      buyerMandate(),
    );
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.violations.some((v) => v.reason.includes("reservation"))).toBe(true);
  });

  it("rejects an expired mandate", () => {
    const expired = { ...buyerMandate(), expiresAt: new Date(Date.now() - 1000).toISOString() };
    const check = checkTermsAgainstMandate(insideBoth, expired);
    expect(check.ok).toBe(false);
  });

  it("detects a mandate whose terms were altered after signing", () => {
    const mandate = buyerMandate();
    expect(verifyMandate(mandate)).toBe(true);
    const tampered = { ...mandate, constraints: { ...mandate.constraints, price: { max: 9000 } } };
    expect(verifyMandate(tampered)).toBe(false);
  });
});
