import type { Mandate } from "./types.ts";

/**
 * The order of importance an owner's weights imply, most important first.
 *
 * This is the only thing priority disclosure ever sends: keys, in order. Ties
 * break by key so the order is deterministic. Dimensions without a preference
 * are left out.
 */
export function priorityOrder(mandate: Mandate): string[] {
  return Object.entries(mandate.preferences)
    .sort(([keyA, a], [keyB, b]) => b.weight - a.weight || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([key]) => key);
}
