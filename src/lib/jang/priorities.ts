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

/**
 * Weights implied by an order alone: rank-order centroid weights, the
 * standard estimate when only a ranking is known. Most important first; they
 * sum to 1.
 */
export function rankOrderCentroid(order: string[]): Record<string, number> {
  const n = order.length;
  const weights: Record<string, number> = {};
  order.forEach((key, i) => {
    let w = 0;
    for (let k = i + 1; k <= n; k += 1) w += 1 / k;
    weights[key] = w / n;
  });
  return weights;
}
