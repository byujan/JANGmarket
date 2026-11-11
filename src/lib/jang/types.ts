import { z } from "zod";

/**
 * A negotiable dimension. Everything is numeric so that utility is well defined
 * for any market; a boolean term (a bundled accessory, say) uses min 0 / max 1.
 * Nothing here is specific to any product category.
 */
export const DimensionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  /**
   * Which end of the range a buyer naturally wants. The seller wants the
   * other. Without this a mandate builder cannot tell "cheap" from "generous",
   * because the engine itself only ever sees numbers.
   */
  buyerPrefers: z.enum(["low", "high"]).optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const MAX_DIMENSIONS = 5;

export const ItemSpecSchema = z.object({
  itemId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  /**
   * At most five negotiable terms. JANG searches every package to find the
   * Pareto frontier once per session; at five terms that takes milliseconds,
   * at six close to a second and at seven around ten seconds.
   */
  dimensions: z.array(DimensionSchema).min(1).max(MAX_DIMENSIONS),
});
export type ItemSpec = z.infer<typeof ItemSpecSchema>;

/** A concrete, fully specified package of terms: one value per dimension. */
export const TermsSchema = z.record(z.string(), z.number());
export type Terms = z.infer<typeof TermsSchema>;

export const RoleSchema = z.enum(["buyer", "seller"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Per-dimension hard bounds. An offer outside these is outside the authority the
 * owner granted, and JANG refuses to carry it.
 */
export const ConstraintSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

/**
 * Per-dimension preference used to score a package. `ideal` is the best value this
 * owner could hope for, `worst` the least they would tolerate; the direction of
 * preference is implied by which is larger, so no separate sign is needed.
 */
export const PreferenceSchema = z.object({
  weight: z.number().positive(),
  ideal: z.number(),
  worst: z.number(),
});
export type Preference = z.infer<typeof PreferenceSchema>;

/** The unsigned body of a mandate. This is what the owner signs. */
export const MandateBodySchema = z.object({
  mandateId: z.string().min(1),
  agentId: z.string().min(1),
  ownerId: z.string().min(1),
  role: RoleSchema,
  itemId: z.string().min(1),
  constraints: z.record(z.string(), ConstraintSchema),
  preferences: z.record(z.string(), PreferenceSchema),
  /** Lowest normalised utility (0..1) the agent may commit the owner to. */
  reservationUtility: z.number().min(0).max(1),
  expiresAt: z.string().datetime(),
  /**
   * How many of this item the owner is willing to part with, or acquire, under
   * this mandate. Absent means one.
   *
   * Without it a seller's agent can sign the same television away to every
   * buyer it talks to, because each session only ever checks its own terms.
   */
  supply: z.number().int().positive().max(10_000).optional(),
  /**
   * Opt in to telling the counterparty which terms matter most to this owner,
   * as an order of keys and nothing else: no weights, bounds or reservation.
   * Optional with no default, so a mandate signed before this existed has the
   * same body, and the same signature, as it always did.
   */
  disclosePriorities: z.boolean().optional(),
});
export type MandateBody = z.infer<typeof MandateBodySchema>;

export const MandateSchema = MandateBodySchema.extend({
  ownerPublicKey: z.string().min(1),
  signature: z.string().min(1),
});
export type Mandate = z.infer<typeof MandateSchema>;

/** Most packages one turn may carry: the main offer plus this many alternatives. */
export const MAX_ALTERNATIVES = 2;

/**
 * An extra package put on the table in the same turn (MESO: multiple
 * equivalent simultaneous offers). It has its own offerId, so accepting it is
 * as unambiguous as accepting the main package, and an agreement names it the
 * same way.
 */
export const AlternativeSchema = z.object({
  offerId: z.string().min(1),
  terms: TermsSchema,
});
export type Alternative = z.infer<typeof AlternativeSchema>;

export const OfferSchema = z.object({
  offerId: z.string().min(1),
  sessionId: z.string().min(1),
  fromAgentId: z.string().min(1),
  round: z.number().int().nonnegative(),
  terms: TermsSchema,
  /** Optional, and absent on every offer made before MESO existed. */
  alternatives: z.array(AlternativeSchema).max(MAX_ALTERNATIVES).optional(),
  note: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const SessionStatusSchema = z.enum(["open", "agreed", "expired", "failed"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export type Session = {
  sessionId: string;
  itemSpec: ItemSpec;
  /** agentId by role. */
  participants: Record<Role, string>;
  /** Private: never leaves the server except through redactSessionFor. */
  mandates: Record<string, Mandate>;
  offers: Offer[];
  status: SessionStatus;
  maxRounds: number;
  expiresAt: string;
  createdAt: string;
  agreementId?: string;
  /** agentId that accepted, and the offer they accepted. */
  acceptedBy?: { agentId: string; offerId: string };
};

/** The body of an agreement. Signed by JANG once both sides have consented. */
export const AgreementBodySchema = z.object({
  agreementId: z.string().min(1),
  sessionId: z.string().min(1),
  itemId: z.string().min(1),
  buyerAgentId: z.string().min(1),
  sellerAgentId: z.string().min(1),
  terms: TermsSchema,
  /** Mandate ids the terms were validated against, for audit. */
  buyerMandateId: z.string().min(1),
  sellerMandateId: z.string().min(1),
  offerId: z.string().min(1),
  acceptedByAgentId: z.string().min(1),
  rounds: z.number().int().positive(),
  agreedAt: z.string().datetime(),
});
export type AgreementBody = z.infer<typeof AgreementBodySchema>;

export const AgreementSchema = AgreementBodySchema.extend({
  algorithm: z.literal("ed25519"),
  jangPublicKey: z.string().min(1),
  signature: z.string().min(1),
});
export type Agreement = z.infer<typeof AgreementSchema>;

/**
 * What an agent is told about how contested its item is. None of it comes from
 * anyone's mandate but its own, so it leaks nothing: how many it may still
 * commit, and how many negotiations are running for the same thing.
 */
export type Market = { remaining: number; authorised: number; openSessions: number };

export type Violation = {
  dimension: string;
  reason: string;
  limit?: number;
  offered?: number;
};

export type MandateCheck = { ok: true } | { ok: false; violations: Violation[] };

export const JangErrorCodes = [
  "MANDATE_VIOLATION",
  "SUPPLY_EXHAUSTED",
  "NOT_YOUR_TURN",
  "SESSION_EXPIRED",
  "SESSION_CLOSED",
  "ROUND_LIMIT",
  "NOT_A_PARTICIPANT",
  "NO_STANDING_OFFER",
  "AMBIGUOUS_ACCEPT",
  "INVALID_TERMS",
  "INVALID_MANDATE",
  "NOT_FOUND",
  "UNAUTHORIZED",
] as const;
export type JangErrorCode = (typeof JangErrorCodes)[number];

export class JangError extends Error {
  constructor(
    readonly code: JangErrorCode,
    message: string,
    readonly violations?: Violation[],
  ) {
    super(message);
    this.name = "JangError";
  }
}
