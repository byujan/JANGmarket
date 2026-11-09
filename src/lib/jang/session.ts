import { checkTermsAgainstMandate, isExpired, verifyMandate } from "./mandate.ts";
import { priorityOrder } from "./priorities.ts";
import {
  JangError,
  MAX_ALTERNATIVES,
  type ItemSpec,
  type Mandate,
  type Offer,
  type Role,
  type Session,
  type Terms,
} from "./types.ts";

export type CreateSessionInput = {
  sessionId: string;
  itemSpec: ItemSpec;
  buyerAgentId: string;
  sellerAgentId: string;
  mandates: Mandate[];
  maxRounds?: number;
  ttlSeconds?: number;
  now?: Date;
};

export function createSession(input: CreateSessionInput): Session {
  const now = input.now ?? new Date();
  const participants: Record<Role, string> = {
    buyer: input.buyerAgentId,
    seller: input.sellerAgentId,
  };

  const mandates: Record<string, Mandate> = {};
  for (const mandate of input.mandates) {
    if (!verifyMandate(mandate)) {
      throw new JangError("INVALID_MANDATE", `mandate ${mandate.mandateId} has a bad owner signature`);
    }
    if (isExpired(mandate, now)) {
      throw new JangError("INVALID_MANDATE", `mandate ${mandate.mandateId} expired at ${mandate.expiresAt}`);
    }
    if (mandate.agentId !== participants[mandate.role]) {
      throw new JangError("INVALID_MANDATE", `mandate ${mandate.mandateId} does not match the ${mandate.role} in this session`);
    }
    mandates[mandate.agentId] = mandate;
  }

  for (const role of ["buyer", "seller"] as const) {
    if (!mandates[participants[role]]) {
      throw new JangError("INVALID_MANDATE", `no mandate registered for the ${role}`);
    }
  }

  return {
    sessionId: input.sessionId,
    itemSpec: input.itemSpec,
    participants,
    mandates,
    offers: [],
    status: "open",
    maxRounds: input.maxRounds ?? 20,
    expiresAt: new Date(now.getTime() + (input.ttlSeconds ?? 900) * 1000).toISOString(),
    createdAt: now.toISOString(),
  };
}

export function roleOf(session: Session, agentId: string): Role {
  if (session.participants.buyer === agentId) return "buyer";
  if (session.participants.seller === agentId) return "seller";
  throw new JangError("NOT_A_PARTICIPANT", `agent ${agentId} is not in session ${session.sessionId}`);
}

export function counterpartyOf(session: Session, agentId: string): string {
  return roleOf(session, agentId) === "buyer" ? session.participants.seller : session.participants.buyer;
}

/** The standing offer is the most recent one; only the other side may accept it. */
export function standingOffer(session: Session): Offer | undefined {
  return session.offers.at(-1);
}

/** Nobody may make two offers in a row. Before the first offer, either side may open. */
export function whoseTurn(session: Session): string | "either" {
  const last = standingOffer(session);
  return last ? counterpartyOf(session, last.fromAgentId) : "either";
}

function assertLive(session: Session, now: Date): void {
  if (session.status !== "open") {
    throw new JangError("SESSION_CLOSED", `session ${session.sessionId} is ${session.status}`);
  }
  if (new Date(session.expiresAt).getTime() <= now.getTime()) {
    throw new JangError("SESSION_EXPIRED", `session ${session.sessionId} expired at ${session.expiresAt}`);
  }
}

/** Terms must name every dimension of the item and stay inside its declared range. */
export function validateTermsShape(terms: Terms, spec: ItemSpec): void {
  for (const dimension of spec.dimensions) {
    const value = terms[dimension.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new JangError("INVALID_TERMS", `term "${dimension.key}" must be a finite number`);
    }
    if (value < dimension.min || value > dimension.max) {
      throw new JangError(
        "INVALID_TERMS",
        `term "${dimension.key}" = ${value} is outside the item's range ${dimension.min}..${dimension.max}`,
      );
    }
  }
  for (const key of Object.keys(terms)) {
    if (!spec.dimensions.some((d) => d.key === key)) {
      throw new JangError("INVALID_TERMS", `term "${key}" is not a dimension of this item`);
    }
  }
}

export type OfferResult = { session: Session; offer: Offer };

/** Every package an offer puts on the table, main package first. */
export function packagesOf(offer: Offer): { offerId: string; terms: Terms }[] {
  return [{ offerId: offer.offerId, terms: offer.terms }, ...(offer.alternatives ?? [])];
}

export function submitOffer(
  session: Session,
  agentId: string,
  terms: Terms,
  options: {
    note?: string;
    offerId: string;
    /** MESO: extra packages offered in the same turn, each with its own id. */
    alternatives?: { offerId: string; terms: Terms }[];
    now?: Date;
  },
): OfferResult {
  const now = options.now ?? new Date();
  const role = roleOf(session, agentId);
  assertLive(session, now);

  if (session.offers.length >= session.maxRounds) {
    throw new JangError("ROUND_LIMIT", `session ${session.sessionId} reached its limit of ${session.maxRounds} offers`);
  }

  const turn = whoseTurn(session);
  if (turn !== "either" && turn !== agentId) {
    throw new JangError("NOT_YOUR_TURN", "the counterparty has a standing offer; counter it or accept it");
  }

  const alternatives = options.alternatives ?? [];
  if (alternatives.length > MAX_ALTERNATIVES) {
    throw new JangError("INVALID_TERMS", `an offer may carry at most ${MAX_ALTERNATIVES} alternatives`);
  }
  const ids = new Set([options.offerId, ...alternatives.map((a) => a.offerId)]);
  if (ids.size !== alternatives.length + 1) {
    throw new JangError("INVALID_TERMS", "every package in an offer needs its own offerId");
  }

  // The authority check: an agent may not propose a package its own owner did
  // not authorise, because proposing it is an offer to be bound by it. Every
  // alternative is an offer in its own right, so every one is checked, and one
  // bad package refuses the whole turn.
  const packages = [{ offerId: options.offerId, terms }, ...alternatives];
  packages.forEach((pkg, index) => {
    validateTermsShape(pkg.terms, session.itemSpec);
    const check = checkTermsAgainstMandate(pkg.terms, session.mandates[agentId], now);
    if (!check.ok) {
      const which = index === 0 ? "this package" : `alternative ${index}`;
      throw new JangError(
        "MANDATE_VIOLATION",
        `${which} is outside the authority your owner granted you as ${role}`,
        check.violations,
      );
    }
  });

  const offer: Offer = {
    offerId: options.offerId,
    sessionId: session.sessionId,
    fromAgentId: agentId,
    round: session.offers.length + 1,
    terms: { ...terms },
    ...(alternatives.length > 0
      ? { alternatives: alternatives.map((a) => ({ offerId: a.offerId, terms: { ...a.terms } })) }
      : {}),
    note: options.note,
    createdAt: now.toISOString(),
  };

  return { session: { ...session, offers: [...session.offers, offer] }, offer };
}

/** `offer` is the package that was accepted, with its own offerId and terms. */
export type AcceptResult = { session: Session; offer: Offer };

/**
 * Accepting the counterparty's standing offer closes the deal. The offer was
 * already checked against the proposer's mandate when it was made, and it is
 * checked against the accepter's mandate here, so an agreement always satisfies
 * both owners by construction.
 *
 * When the standing offer carries alternatives, the accepter must name which
 * package by its offerId. Guessing would make the signed agreement ambiguous.
 */
export function acceptStandingOffer(
  session: Session,
  agentId: string,
  options: { offerId?: string; now?: Date } = {},
): AcceptResult {
  const now = options.now ?? new Date();
  roleOf(session, agentId);
  assertLive(session, now);

  const standing = standingOffer(session);
  if (!standing) {
    throw new JangError("NO_STANDING_OFFER", "there is nothing to accept yet");
  }
  if (standing.fromAgentId === agentId) {
    throw new JangError("NOT_YOUR_TURN", "you cannot accept your own offer");
  }

  const packages = packagesOf(standing);
  let chosen = packages[0];
  if (options.offerId !== undefined) {
    const match = packages.find((p) => p.offerId === options.offerId);
    if (!match) {
      throw new JangError("NO_STANDING_OFFER", `${options.offerId} is not a package in the standing offer`);
    }
    chosen = match;
  } else if (packages.length > 1) {
    throw new JangError(
      "AMBIGUOUS_ACCEPT",
      `the standing offer has ${packages.length} packages; name the one you accept by its offerId`,
    );
  }

  const check = checkTermsAgainstMandate(chosen.terms, session.mandates[agentId], now);
  if (!check.ok) {
    throw new JangError(
      "MANDATE_VIOLATION",
      "accepting this package would exceed the authority your owner granted you",
      check.violations,
    );
  }

  const { alternatives: _siblings, ...rest } = standing;
  const offer: Offer = { ...rest, offerId: chosen.offerId, terms: { ...chosen.terms } };
  return {
    session: { ...session, status: "agreed", acceptedBy: { agentId, offerId: chosen.offerId } },
    offer,
  };
}

/**
 * The single place a session is turned into something an agent may see.
 * It carries the caller's own mandate and never the counterparty's.
 */
export type SessionView = {
  sessionId: string;
  status: Session["status"];
  itemSpec: ItemSpec;
  you: { agentId: string; role: Role };
  counterparty: { agentId: string; role: Role };
  yourMandate: Mandate;
  /**
   * Only when the counterparty's owner opted in: their terms in order of
   * importance, most important first. Keys only, never a number.
   */
  counterpartyPriorities?: string[];
  offers: Offer[];
  standingOffer?: Offer;
  whoseTurn: string | "either";
  roundsUsed: number;
  maxRounds: number;
  expiresAt: string;
  agreementId?: string;
};

export function redactSessionFor(agentId: string, session: Session): SessionView {
  const role = roleOf(session, agentId);
  const otherId = counterpartyOf(session, agentId);
  return {
    sessionId: session.sessionId,
    status: session.status,
    itemSpec: session.itemSpec,
    you: { agentId, role },
    counterparty: { agentId: otherId, role: role === "buyer" ? "seller" : "buyer" },
    yourMandate: session.mandates[agentId],
    ...(session.mandates[otherId].disclosePriorities
      ? { counterpartyPriorities: priorityOrder(session.mandates[otherId]) }
      : {}),
    offers: session.offers,
    standingOffer: standingOffer(session),
    whoseTurn: whoseTurn(session),
    roundsUsed: session.offers.length,
    maxRounds: session.maxRounds,
    expiresAt: session.expiresAt,
    agreementId: session.agreementId,
  };
}
