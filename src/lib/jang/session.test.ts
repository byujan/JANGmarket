import { describe, expect, it } from "vitest";
import { acceptStandingOffer, createSession, redactSessionFor, submitOffer, whoseTurn } from "./session.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "./testing.ts";
import { JangError, type Session } from "./types.ts";

const agreeable = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

function freshSession(): Session {
  return createSession({
    sessionId: "sess-1",
    itemSpec: testItemSpec,
    buyerAgentId: "agent-buyer",
    sellerAgentId: "agent-seller",
    mandates: [buyerMandate(), sellerMandate()],
  });
}

function expectJangError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(JangError);
    expect((error as JangError).code).toBe(code);
    return;
  }
  throw new Error(`expected a ${code} error, but nothing was thrown`);
}

describe("negotiation session", () => {
  it("lets either side open, then strictly alternates", () => {
    const session = freshSession();
    expect(whoseTurn(session)).toBe("either");

    const afterSeller = submitOffer(session, "agent-seller", agreeable, { offerId: "o1" }).session;
    expect(whoseTurn(afterSeller)).toBe("agent-buyer");

    expectJangError(
      () => submitOffer(afterSeller, "agent-seller", agreeable, { offerId: "o2" }),
      "NOT_YOUR_TURN",
    );
  });

  it("refuses an offer outside the offering agent's own mandate", () => {
    const session = freshSession();
    expectJangError(
      () => submitOffer(session, "agent-seller", { ...agreeable, price: 1100 }, { offerId: "o1" }),
      "MANDATE_VIOLATION",
    );
  });

  it("refuses an accept that would breach the accepting agent's mandate", () => {
    // The seller legitimately offers a package it likes; the buyer cannot afford it.
    const session = freshSession();
    const offered = { price: 1480, deliveryDays: 28, warrantyMonths: 6, bundle: 0 };
    const afterOffer = submitOffer(session, "agent-seller", offered, { offerId: "o1" }).session;
    expectJangError(() => acceptStandingOffer(afterOffer, "agent-buyer"), "MANDATE_VIOLATION");
    expect(afterOffer.status).toBe("open");
  });

  it("closes the deal when the counterparty accepts a standing offer", () => {
    const session = freshSession();
    const afterOffer = submitOffer(session, "agent-seller", agreeable, { offerId: "o1" }).session;
    const result = acceptStandingOffer(afterOffer, "agent-buyer");
    expect(result.session.status).toBe("agreed");
    expect(result.offer.offerId).toBe("o1");
  });

  it("refuses an offer naming a dimension the item does not have", () => {
    const session = freshSession();
    expectJangError(
      () => submitOffer(session, "agent-seller", { ...agreeable, colour: 3 }, { offerId: "o1" }),
      "INVALID_TERMS",
    );
  });

  it("refuses to let a stranger act in the session", () => {
    expectJangError(() => submitOffer(freshSession(), "agent-intruder", agreeable, { offerId: "o1" }), "NOT_A_PARTICIPANT");
  });

  it("stops at the round limit", () => {
    let session = createSession({
      sessionId: "sess-2",
      itemSpec: testItemSpec,
      buyerAgentId: "agent-buyer",
      sellerAgentId: "agent-seller",
      mandates: [buyerMandate(), sellerMandate()],
      maxRounds: 2,
    });
    session = submitOffer(session, "agent-seller", agreeable, { offerId: "o1" }).session;
    session = submitOffer(session, "agent-buyer", agreeable, { offerId: "o2" }).session;
    expectJangError(() => submitOffer(session, "agent-seller", agreeable, { offerId: "o3" }), "ROUND_LIMIT");
  });
});

describe("mandate privacy", () => {
  it("never exposes the counterparty's mandate in a session view", () => {
    const session = submitOffer(freshSession(), "agent-seller", agreeable, { offerId: "o1" }).session;
    const buyerView = redactSessionFor("agent-buyer", session);
    const serialised = JSON.stringify(buyerView);

    const sellersSecrets = session.mandates["agent-seller"];
    expect(buyerView.yourMandate.agentId).toBe("agent-buyer");
    expect(serialised).not.toContain(sellersSecrets.mandateId);
    expect(serialised).not.toContain(sellersSecrets.signature);
    // The seller's $1,180 floor must not be inferable from the payload.
    expect(serialised).not.toContain("1180");
    // Nothing outside the caller's own mandate may mention preferences,
    // weights or utility, any of which would reveal the counterparty's position.
    const { yourMandate, ...everythingElse } = buyerView;
    expect(JSON.stringify(everythingElse)).not.toMatch(/utilit|preference|weight|reservation/i);
  });
});

describe("multiple equivalent offers (MESO)", () => {
  const cheapSlow = { price: 1200, deliveryDays: 28, warrantyMonths: 18, bundle: 0 };
  const dearBundled = { price: 1300, deliveryDays: 25, warrantyMonths: 12, bundle: 1 };

  function withMeso(): Session {
    return submitOffer(freshSession(), "agent-seller", agreeable, {
      offerId: "o1",
      alternatives: [
        { offerId: "o1-b", terms: cheapSlow },
        { offerId: "o1-c", terms: dearBundled },
      ],
    }).session;
  }

  it("records every package in one turn, counting one round", () => {
    const session = withMeso();
    expect(session.offers).toHaveLength(1);
    expect(session.offers[0].alternatives?.map((a) => a.offerId)).toEqual(["o1-b", "o1-c"]);
    expect(whoseTurn(session)).toBe("agent-buyer");
  });

  it("refuses the whole turn when any alternative breaches the proposer's mandate", () => {
    expectJangError(
      () =>
        submitOffer(freshSession(), "agent-seller", agreeable, {
          offerId: "o1",
          alternatives: [{ offerId: "o1-b", terms: { ...cheapSlow, price: 1100 } }],
        }),
      "MANDATE_VIOLATION",
    );
  });

  it("refuses more than two alternatives, and packages that share an id", () => {
    expectJangError(
      () =>
        submitOffer(freshSession(), "agent-seller", agreeable, {
          offerId: "o1",
          alternatives: [
            { offerId: "a", terms: cheapSlow },
            { offerId: "b", terms: cheapSlow },
            { offerId: "c", terms: cheapSlow },
          ],
        }),
      "INVALID_TERMS",
    );
    expectJangError(
      () =>
        submitOffer(freshSession(), "agent-seller", agreeable, {
          offerId: "o1",
          alternatives: [{ offerId: "o1", terms: cheapSlow }],
        }),
      "INVALID_TERMS",
    );
  });

  it("refuses an accept that does not say which package", () => {
    expectJangError(() => acceptStandingOffer(withMeso(), "agent-buyer"), "AMBIGUOUS_ACCEPT");
  });

  it("refuses an accept naming a package that is not on the table", () => {
    expectJangError(() => acceptStandingOffer(withMeso(), "agent-buyer", { offerId: "nope" }), "NO_STANDING_OFFER");
  });

  it("closes on exactly the package the accepter named", () => {
    const result = acceptStandingOffer(withMeso(), "agent-buyer", { offerId: "o1-b" });
    expect(result.session.status).toBe("agreed");
    expect(result.session.acceptedBy).toEqual({ agentId: "agent-buyer", offerId: "o1-b" });
    expect(result.offer.offerId).toBe("o1-b");
    expect(result.offer.terms).toEqual(cheapSlow);
    expect(result.offer.alternatives).toBeUndefined();
  });

  it("checks the named package, not the main one, against the accepter's mandate", () => {
    // The buyer will not take delivery after 30 days.
    const session = submitOffer(freshSession(), "agent-seller", agreeable, {
      offerId: "o1",
      alternatives: [{ offerId: "o1-slow", terms: { ...cheapSlow, deliveryDays: 40 } }],
    }).session;
    expectJangError(() => acceptStandingOffer(session, "agent-buyer", { offerId: "o1-slow" }), "MANDATE_VIOLATION");
    expect(acceptStandingOffer(session, "agent-buyer", { offerId: "o1" }).offer.offerId).toBe("o1");
  });
});
