/**
 * Turning an asking price into something two agents can bargain over.
 *
 * A listing like Craigslist's is a photograph, a paragraph and a number. JANG
 * needs a term with a range and a step, because the house's position is
 * derived from the item's declared band and because every offer is checked
 * against that lattice. This builds the band from the number.
 *
 * The band is deliberately wider than the asking price on both sides. It is
 * not anyone's limit — those live in the private mandates — it is only the
 * space the conversation may move through, and a band that stopped at the
 * asking price would leave a buyer-side listing with nowhere to go up.
 */
import type { Dimension } from "./types.ts";

/** How far below and above the asking price the conversation may range. */
const FLOOR = 0.5;
const CEILING = 1.2;

/** Increments people actually name prices in. */
const NICE = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/**
 * About a hundredth of the asking price, rounded to a figure a person would
 * say out loud. A $500 bike moves in fives; a $40,000 contract does not.
 */
export function niceStep(asking: number): number {
  const target = Math.abs(asking) / 100;
  for (const step of NICE) if (step >= target) return step;
  return NICE[NICE.length - 1]!;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * The price term for a free-form listing.
 *
 * Both ends are snapped to the step so the asking price itself lands on the
 * lattice: an offer at exactly what was asked has to be a legal package, or
 * the listing contradicts itself.
 */
export function priceDimension(asking: number, label = "Price"): Dimension {
  const step = niceStep(asking);
  const min = Math.max(step, roundTo(asking * FLOOR, step));
  const max = Math.max(min + step, roundTo(asking * CEILING, step));
  return { key: "price", label, unit: "USD", min, max, step, buyerPrefers: "low" };
}

/** Where the asking price sits once snapped onto its own lattice. */
export function askingOnLattice(asking: number): number {
  const step = niceStep(asking);
  const dimension = priceDimension(asking);
  return Math.min(dimension.max, Math.max(dimension.min, roundTo(asking, step)));
}
