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
