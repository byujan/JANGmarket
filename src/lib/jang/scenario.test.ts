import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { issueMandate, parseScenario } from "./scenario.ts";
import { verifyMandate } from "./mandate.ts";
import { checkTermsAgainstMandate } from "./mandate.ts";
import { utility } from "./utility.ts";

const scenario = parseScenario(JSON.parse(readFileSync("agents/scenarios/tv-clearance.json", "utf8")));

describe("the shipped scenario", () => {
  it("validates against the scenario schema", () => {
    expect(scenario.scenarioId).toBe("tv-clearance");
  });

  it("issues mandates that verify", () => {
    expect(verifyMandate(issueMandate(scenario, "buyer"))).toBe(true);
    expect(verifyMandate(issueMandate(scenario, "seller"))).toBe(true);
  });

  it("has a zone of possible agreement, so a deal is reachable at all", () => {
    const buyer = issueMandate(scenario, "buyer");
    const seller = issueMandate(scenario, "seller");
    const middle = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };
    expect(checkTermsAgainstMandate(middle, buyer).ok).toBe(true);
    expect(checkTermsAgainstMandate(middle, seller).ok).toBe(true);
  });

  it("has a fixed price the buyer would walk away from, which is the point of negotiating", () => {
    const buyer = issueMandate(scenario, "buyer");
    const baseline = scenario.fixedPriceBaseline.terms;
    expect(utility(baseline, buyer)).toBeLessThan(buyer.reservationUtility);
    expect(checkTermsAgainstMandate(baseline, buyer).ok).toBe(false);
  });
});

/*
 * Every market that ships, not only the television. A scenario is market
 * design expressed as data, so these are the checks that catch a market which
 * cannot produce a negotiation worth watching.
 */
import { readdirSync } from "node:fs";
import { groundTruth } from "./frontier.ts";

const shipped = readdirSync("agents/scenarios")
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({
    name,
    scenario: parseScenario(JSON.parse(readFileSync(`agents/scenarios/${name}`, "utf8"))),
  }));

describe.each(shipped)("$name", ({ scenario: market }) => {
  const buyer = issueMandate(market, "buyer");
  const seller = issueMandate(market, "seller");

  it("has mandates that verify", () => {
    expect(verifyMandate(buyer)).toBe(true);
    expect(verifyMandate(seller)).toBe(true);
  });

  it("leaves a deal to be found", () => {
    const truth = groundTruth(market.itemSpec, buyer, seller);
    expect(truth.feasible.length).toBeGreaterThan(0);
  });

  it("rewards trading over splitting every term", () => {
    // More than one term, weighed differently by the two sides, is what makes
    // a negotiation more than haggling.
    expect(market.itemSpec.dimensions.length).toBeGreaterThan(1);
    const differs = market.itemSpec.dimensions.some(
      (d) => (buyer.preferences[d.key]?.weight ?? 0) !== (seller.preferences[d.key]?.weight ?? 0),
    );
    expect(differs).toBe(true);
  });

  it("posts a price at least one side would walk away from", () => {
    const posted = market.fixedPriceBaseline.terms;
    const buyerTakesIt = checkTermsAgainstMandate(posted, buyer).ok;
    const sellerTakesIt = checkTermsAgainstMandate(posted, seller).ok;
    expect(buyerTakesIt && sellerTakesIt).toBe(false);
  });

  it("says which end of each term a buyer wants, so a listing can be reasoned about", () => {
    for (const dimension of market.itemSpec.dimensions) {
      expect(dimension.buyerPrefers === "low" || dimension.buyerPrefers === "high").toBe(true);
    }
  });
});
