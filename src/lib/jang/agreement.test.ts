import { describe, expect, it } from "vitest";
import { auditAgreement, buildAgreementBody, signAgreement, verifyAgreementSignature } from "./agreement.ts";
import { generateKeyPair } from "./crypto.ts";
import { acceptStandingOffer, createSession, submitOffer } from "./session.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "./testing.ts";

const agreeable = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

function closedDeal(meso = false) {
  const buyer = buyerMandate();
  const seller = sellerMandate();
  const session = createSession({
    sessionId: "sess-1",
    itemSpec: testItemSpec,
    buyerAgentId: "agent-buyer",
    sellerAgentId: "agent-seller",
    mandates: [buyer, seller],
  });
  const alternatives = meso ? [{ offerId: "o1-b", terms: { ...agreeable, price: 1250, deliveryDays: 28 } }] : undefined;
  const offered = submitOffer(session, "agent-seller", agreeable, { offerId: "o1", alternatives }).session;
  const accepted = acceptStandingOffer(offered, "agent-buyer", meso ? { offerId: "o1-b" } : {});
  const jang = generateKeyPair();
  const agreement = signAgreement(
    buildAgreementBody({
      agreementId: "agr-1",
      session: accepted.session,
      offer: accepted.offer,
      acceptedByAgentId: "agent-buyer",
    }),
    jang.privateKeyPem,
    jang.publicKeyPem,
  );
  return { agreement, jang, mandates: { buyer, seller } };
}

describe("signed agreements", () => {
  it("verifies against the JANG public key", () => {
    const { agreement, jang } = closedDeal();
    expect(verifyAgreementSignature(agreement, jang.publicKeyPem)).toBe(true);
  });

  it("fails verification when a term is altered after signing", () => {
    const { agreement, jang } = closedDeal();
    const tampered = { ...agreement, terms: { ...agreement.terms, price: 900 } };
    expect(verifyAgreementSignature(tampered, jang.publicKeyPem)).toBe(false);
  });

  it("fails verification when a forger re-signs with their own key", () => {
    const { agreement, jang } = closedDeal();
    const forger = generateKeyPair();
    const { algorithm, jangPublicKey, signature, ...body } = agreement;
    const forged = signAgreement(
      { ...body, terms: { ...body.terms, price: 900 } },
      forger.privateKeyPem,
      forger.publicKeyPem,
    );
    // Self-consistent, but not signed by the JANG key the agent trusts.
    expect(verifyAgreementSignature(forged, forged.jangPublicKey)).toBe(true);
    expect(verifyAgreementSignature(forged, jang.publicKeyPem)).toBe(false);
  });

  it("audits clean against both owners' mandates", () => {
    const { agreement, jang, mandates } = closedDeal();
    const audit = auditAgreement(agreement, jang.publicKeyPem, mandates);
    expect(audit).toMatchObject({ ok: true, signatureValid: true });
    expect(audit.buyer.violations).toEqual([]);
    expect(audit.seller.violations).toEqual([]);
  });

  it("names the chosen alternative, and only its terms, when one of several packages was accepted", () => {
    const { agreement, jang, mandates } = closedDeal(true);
    expect(agreement.offerId).toBe("o1-b");
    expect(agreement.terms).toEqual({ ...agreeable, price: 1250, deliveryDays: 28 });
    expect(agreement.rounds).toBe(1);
    expect(auditAgreement(agreement, jang.publicKeyPem, mandates).ok).toBe(true);
  });
});
