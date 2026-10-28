import { canonicalJson } from "./canonical.ts";
import { signPayload, verifyPayload } from "./crypto.ts";
import { MandateBodySchema, MandateSchema, type Mandate, type MandateBody, type MandateCheck, type Terms, type Violation } from "./types.ts";
import { utility } from "./utility.ts";

/** An owner signs a mandate body with their own key before handing it to JANG. */
export function signMandate(body: MandateBody, ownerPrivateKeyPem: string, ownerPublicKeyPem: string): Mandate {
  const parsed = MandateBodySchema.parse(body);
  return {
    ...parsed,
    ownerPublicKey: ownerPublicKeyPem,
    signature: signPayload(parsed, ownerPrivateKeyPem, canonicalJson),
  };
}

/** JANG checks the owner's signature before it will act on a mandate. */
export function verifyMandate(mandate: Mandate): boolean {
  const parsed = MandateSchema.safeParse(mandate);
  if (!parsed.success) return false;
  const { ownerPublicKey, signature, ...body } = parsed.data;
  return verifyPayload(body, signature, ownerPublicKey, canonicalJson);
}

export function isExpired(mandate: Mandate, now = new Date()): boolean {
  return new Date(mandate.expiresAt).getTime() <= now.getTime();
}

/**
 * The authority check. A package of terms is inside a mandate when every hard
 * bound holds and the resulting utility is at or above the owner's reservation.
 * This runs on both offers and accepts: proposing a package commits you to it.
 */
export function checkTermsAgainstMandate(terms: Terms, mandate: Mandate, now = new Date()): MandateCheck {
  const violations: Violation[] = [];

  if (isExpired(mandate, now)) {
    violations.push({ dimension: "*", reason: `mandate expired at ${mandate.expiresAt}` });
  }

  for (const [key, constraint] of Object.entries(mandate.constraints)) {
    const value = terms[key];
    if (value === undefined) {
      violations.push({ dimension: key, reason: "term missing from offer" });
      continue;
    }
    if (constraint.max !== undefined && value > constraint.max) {
      violations.push({ dimension: key, reason: `above the maximum allowed`, limit: constraint.max, offered: value });
    }
    if (constraint.min !== undefined && value < constraint.min) {
      violations.push({ dimension: key, reason: `below the minimum allowed`, limit: constraint.min, offered: value });
    }
  }

  const u = utility(terms, mandate);
  if (u < mandate.reservationUtility) {
    violations.push({
      dimension: "*",
      reason: "package is worth less than the owner's reservation value",
      limit: mandate.reservationUtility,
      offered: Number(u.toFixed(4)),
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
