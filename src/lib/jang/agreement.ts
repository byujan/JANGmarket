import { canonicalJson } from "./canonical.ts";
import { signPayload, verifyPayload } from "./crypto.ts";
import { checkTermsAgainstMandate } from "./mandate.ts";
import {
  AgreementBodySchema,
  AgreementSchema,
  type Agreement,
  type AgreementBody,
  type Mandate,
  type Offer,
  type Session,
  type Violation,
} from "./types.ts";

export function buildAgreementBody(input: {
  agreementId: string;
  session: Session;
  offer: Offer;
  acceptedByAgentId: string;
  now?: Date;
}): AgreementBody {
  const { session, offer } = input;
  const buyerId = session.participants.buyer;
  const sellerId = session.participants.seller;
  return AgreementBodySchema.parse({
    agreementId: input.agreementId,
    sessionId: session.sessionId,
    itemId: session.itemSpec.itemId,
    buyerAgentId: buyerId,
    sellerAgentId: sellerId,
    terms: offer.terms,
    buyerMandateId: session.mandates[buyerId].mandateId,
    sellerMandateId: session.mandates[sellerId].mandateId,
    offerId: offer.offerId,
    acceptedByAgentId: input.acceptedByAgentId,
    rounds: session.offers.length,
    agreedAt: (input.now ?? new Date()).toISOString(),
  });
}

/** JANG's own signature over the agreed package. */
export function signAgreement(body: AgreementBody, jangPrivateKeyPem: string, jangPublicKeyPem: string): Agreement {
  return {
    ...body,
    algorithm: "ed25519",
    jangPublicKey: jangPublicKeyPem,
    signature: signPayload(body, jangPrivateKeyPem, canonicalJson),
  };
}

/**
 * Check an agreement's signature. The caller supplies the JANG public key it
 * trusts rather than reading it off the agreement, so a forged agreement that
 * carries its own key does not verify.
 */
export function verifyAgreementSignature(agreement: Agreement, trustedJangPublicKeyPem: string): boolean {
  const parsed = AgreementSchema.safeParse(agreement);
  if (!parsed.success) return false;
  const { algorithm, jangPublicKey, signature, ...body } = parsed.data;
  return verifyPayload(body, signature, trustedJangPublicKeyPem, canonicalJson);
}

export type AgreementAudit = {
  signatureValid: boolean;
  buyer: { ok: boolean; violations: Violation[] };
  seller: { ok: boolean; violations: Violation[] };
  ok: boolean;
};

/**
 * The independent check an agent runs before it acts on an agreement: is this
 * really signed by JANG, and does every term sit inside my own mandate?
 */
export function auditAgreement(
  agreement: Agreement,
  trustedJangPublicKeyPem: string,
  mandates: { buyer: Mandate; seller: Mandate },
  now = new Date(),
): AgreementAudit {
  const signatureValid = verifyAgreementSignature(agreement, trustedJangPublicKeyPem);
  const checkedAt = new Date(Math.min(now.getTime(), new Date(agreement.agreedAt).getTime()));
  const buyerCheck = checkTermsAgainstMandate(agreement.terms, mandates.buyer, checkedAt);
  const sellerCheck = checkTermsAgainstMandate(agreement.terms, mandates.seller, checkedAt);
  const buyer = { ok: buyerCheck.ok, violations: buyerCheck.ok ? [] : buyerCheck.violations };
  const seller = { ok: sellerCheck.ok, violations: sellerCheck.ok ? [] : sellerCheck.violations };
  return { signatureValid, buyer, seller, ok: signatureValid && buyer.ok && seller.ok };
}
