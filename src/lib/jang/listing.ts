/**
 * Turning an item somebody listed into something negotiable.
 *
 * A scenario file carries both sides' positions, written by hand. A listing
 * carries neither: the person who listed it describes the terms and the range
 * each may move across, then signs their own limits privately, exactly as they
 * would for a built-in market.
 *
 * That leaves the other side to invent, so that one person can negotiate
 * without waiting for a second. The house's position is derived **from the
 * item's declared ranges alone** and never from the lister's mandate. If it
 * were derived from their limits the house would always be able to deal, and
 * the negotiation would be theatre. Derived this way the house has a real
 * position of its own, and may refuse.
 */
import type { Dimension, ItemSpec, MandateBody, Role } from "./types.ts";

/** How far toward its preferred end the house aims. */
const HOUSE_IDEAL = 0.8;
/** How far from its preferred end the house will not go past. */
const HOUSE_LIMIT = 0.3;
/** Money is usually what a market is mostly about. */
const MONEY_WEIGHT = 3;
const TERM_WEIGHT = 1;

/** Which end of a dimension a given role reaches for. */
export function prefersHighEnd(dimension: Dimension, role: Role): boolean {
  const buyerWantsHigh = dimension.buyerPrefers === "high";
  return role === "buyer" ? buyerWantsHigh : !buyerWantsHigh;
}

function at(dimension: Dimension, fraction: number): number {
  const span = dimension.max - dimension.min;
  const raw = dimension.min + span * fraction;
  const stepped = Math.round((raw - dimension.min) / dimension.step) * dimension.step + dimension.min;
  return Math.min(dimension.max, Math.max(dimension.min, Number(stepped.toFixed(6))));
}

export const opposite = (role: Role): Role => (role === "buyer" ? "seller" : "buyer");

/**
 * The body of a mandate for the house, on the side the lister did not take.
 * Deterministic: the same item always produces the same counterparty.
 */
export function houseMandateBody(input: {
  itemSpec: ItemSpec;
  listedRole: Role;
  agentId: string;
  ownerId: string;
  mandateId: string;
  expiresAt: string;
  supply?: number;
}): MandateBody {
  const role = opposite(input.listedRole);
  const constraints: MandateBody["constraints"] = {};
  const preferences: MandateBody["preferences"] = {};

  for (const dimension of input.itemSpec.dimensions) {
    const wantsHigh = prefersHighEnd(dimension, role);
    const ideal = at(dimension, wantsHigh ? HOUSE_IDEAL : 1 - HOUSE_IDEAL);
    const limit = at(dimension, wantsHigh ? HOUSE_LIMIT : 1 - HOUSE_LIMIT);

    constraints[dimension.key] = wantsHigh ? { min: limit } : { max: limit };
    // The limit doubles as the worst outcome worth having, so the scale the
    // engine scores on matches the bound it enforces.
    preferences[dimension.key] = {
      weight: dimension.unit === "USD" ? MONEY_WEIGHT : TERM_WEIGHT,
      ideal,
      worst: limit,
    };
  }

  return {
    mandateId: input.mandateId,
    agentId: input.agentId,
    ownerId: input.ownerId,
    role,
    itemId: input.itemSpec.itemId,
    constraints,
    preferences,
    reservationUtility: 0.3,
    expiresAt: input.expiresAt,
    ...(input.supply === undefined ? {} : { supply: input.supply }),
  };
}
