"use client";

/**
 * A negotiation drawn as the thing it actually is: two positions closing on
 * each other.
 *
 * Each round is a row. The buyer's bar reaches in from the left and the
 * seller's in from the right, both stopping at the price they named, so the
 * white space between them is the distance still to be bridged. When it
 * disappears, they have agreed.
 */
import type { Dimension, Offer, Terms } from "@/lib/jang/types.ts";

export type LadderProps = {
  dimensions: Dimension[];
  offers: Offer[];
  buyerAgentId: string;
  agreedOfferId?: string;
};

/** The axis of the ladder: money if the item has a price, else its first term. */
function axisOf(dimensions: Dimension[]): Dimension {
  return dimensions.find((dimension) => dimension.unit === "USD") ?? dimensions[0];
}

function formatValue(dimension: Dimension, value: number): string {
  if (dimension.unit === "USD") return `$${value.toLocaleString("en-US")}`;
  if (dimension.min === 0 && dimension.max === 1) return value ? "yes" : "no";
  return `${value}${dimension.unit ? ` ${dimension.unit}` : ""}`;
}

/** The other terms, said briefly, because price is never the whole deal. */
function sideTerms(dimensions: Dimension[], axis: Dimension, terms: Terms): string {
  return dimensions
    .filter((dimension) => dimension.key !== axis.key)
    .map((dimension) => formatValue(dimension, terms[dimension.key]))
    .join(" · ");
}

export function ConvergenceLadder({ dimensions, offers, buyerAgentId, agreedOfferId }: LadderProps) {
  const axis = axisOf(dimensions);

  if (offers.length === 0) {
    return (
      <div className="empty">
        <strong>No offers yet</strong>
        The first proposal will appear here as soon as an agent makes it.
      </div>
    );
  }

  // Scale to the ground actually being fought over, not the item's full range,
  // so the convergence fills the width instead of hiding in a corner.
  const values = offers.map((offer) => offer.terms[axis.key]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.max(1, high * 0.1)) * 0.12;
  const from = low - pad;
  const span = high + pad - from;
  const positionOf = (value: number) => ((value - from) / span) * 100;

  return (
    <div className="ladder">
      <div className="ladder-heads">
        <span className="buyer">Buyer</span>
        <span className="mute small">{axis.label.toLowerCase()} converging</span>
        <span className="seller">Seller</span>
      </div>

      <ol className="ladder-rows">
        {offers.map((offer) => {
          const isBuyer = offer.fromAgentId === buyerAgentId;
          const value = offer.terms[axis.key];
          const at = positionOf(value);
          const agreed = offer.offerId === agreedOfferId;

          return (
            <li
              key={offer.offerId}
              className={`rung ${isBuyer ? "rung-buyer" : "rung-seller"}${agreed ? " rung-agreed" : ""}`}
            >
              <span className="rung-round mono small faint">{offer.round}</span>

              <span className="rung-track">
                <span
                  className="rung-bar"
                  style={isBuyer ? { left: 0, width: `${at}%` } : { right: 0, width: `${100 - at}%` }}
                />
                <span
                  className="rung-value mono"
                  style={isBuyer ? { left: `calc(${at}% + 0.5rem)` } : { right: `calc(${100 - at}% + 0.5rem)` }}
                >
                  {formatValue(axis, value)}
                </span>
              </span>

              <span className="rung-terms mono small faint">{sideTerms(dimensions, axis, offer.terms)}</span>

              {offer.note ? <span className="rung-note small mute">{offer.note}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
