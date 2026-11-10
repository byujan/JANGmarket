/**
 * The operator's picture of a negotiation in utility space: every package both
 * owners could accept, the Pareto frontier of those, and where the offers and
 * the deal actually landed.
 *
 * Server-rendered, and only on the admin page, because every point on it is
 * derived from both private mandates.
 */
import type { GroundTruth, Quality } from "@/lib/jang/frontier.ts";
import type { Dimension } from "@/lib/jang/types.ts";
import type { Mandate, Offer, Terms } from "@/lib/jang/types.ts";
import { utility } from "@/lib/jang/utility.ts";

export type FrontierChartProps = {
  truth: GroundTruth;
  buyer: Mandate;
  seller: Mandate;
  offers: Offer[];
  agreedTerms?: Terms;
  quality?: Quality;
  /** The package JANG could have proposed before signing (operator-only). */
  missed?: { terms: Terms; buyerGain: number; sellerGain: number };
  dimensions: Dimension[];
};

const SIZE = 320;
const PAD = 36;
const MAX_DOTS = 1500;

export function FrontierChart({ truth, buyer, seller, offers, agreedTerms, quality, missed, dimensions }: FrontierChartProps) {
  const x = (u: number) => PAD + u * (SIZE - 2 * PAD);
  const y = (u: number) => SIZE - PAD - u * (SIZE - 2 * PAD);

  if (truth.feasible.length === 0) {
    return (
      <div className="notice notice-warn">
        No package satisfies both mandates, so no negotiation between these two owners can end in a deal. JANG knew
        this when the session opened and logged it; the agents were not told, because telling them would let an agent
        probe the other side&apos;s limits.
      </div>
    );
  }

  // Thin a large cloud evenly; the frontier is drawn from its own list, so
  // nothing that matters is lost.
  const every = Math.max(1, Math.ceil(truth.feasible.length / MAX_DOTS));
  const cloud = truth.feasible.filter((_, i) => i % every === 0);
  const frontierPath = truth.frontier.map((p, i) => `${i ? "L" : "M"}${x(p.buyer).toFixed(1)},${y(p.seller).toFixed(1)}`).join(" ");
  const packages = offers.flatMap((offer) =>
    [offer.terms, ...(offer.alternatives ?? []).map((a) => a.terms)].map((terms) => ({
      fromBuyer: offer.fromAgentId === buyer.agentId,
      b: utility(terms, buyer),
      s: utility(terms, seller),
    })),
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Feasible deals in utility space, with the Pareto frontier, the offers made and the deal reached"
        style={{ width: "100%", maxWidth: 420, display: "block" }}
      >
        <rect x={x(0)} y={y(1)} width={x(1) - x(0)} height={y(0) - y(1)} fill="none" stroke="var(--line)" />
        <line x1={x(buyer.reservationUtility)} x2={x(buyer.reservationUtility)} y1={y(0)} y2={y(1)} stroke="var(--buyer-dim)" strokeDasharray="3 3" />
        <line x1={x(0)} x2={x(1)} y1={y(seller.reservationUtility)} y2={y(seller.reservationUtility)} stroke="var(--seller-dim)" strokeDasharray="3 3" />

        {cloud.map((p, i) => (
          <circle key={i} cx={x(p.buyer)} cy={y(p.seller)} r={1} fill="var(--faint)" opacity={0.5} />
        ))}
        <path d={frontierPath} fill="none" stroke="var(--text)" strokeWidth={1.5} />

        {packages.map((p, i) => (
          <circle key={i} cx={x(p.b)} cy={y(p.s)} r={3} fill={p.fromBuyer ? "var(--buyer)" : "var(--seller)"} opacity={0.85} />
        ))}
        {missed ? (
          <rect
            x={x(utility(missed.terms, buyer)) - 4}
            y={y(utility(missed.terms, seller)) - 4}
            width={8}
            height={8}
            fill="none"
            stroke="var(--text)"
            strokeWidth={1.5}
            transform={`rotate(45 ${x(utility(missed.terms, buyer))} ${y(utility(missed.terms, seller))})`}
          />
        ) : null}
        {agreedTerms ? (
          <circle cx={x(utility(agreedTerms, buyer))} cy={y(utility(agreedTerms, seller))} r={6} fill="none" stroke="var(--agree)" strokeWidth={2} />
        ) : null}

        <text x={SIZE / 2} y={SIZE - 8} textAnchor="middle" fontSize={10} fill="var(--mute)">
          value to buyer →
        </text>
        <text x={12} y={SIZE / 2} textAnchor="middle" fontSize={10} fill="var(--mute)" transform={`rotate(-90 12 ${SIZE / 2})`}>
          value to seller →
        </text>
      </svg>

      <p className="small mute" style={{ marginTop: "0.5rem" }}>
        {truth.feasible.length.toLocaleString("en-US")} packages satisfy both mandates; {truth.frontier.length} of them are
        on the frontier (white line). Dots are offers, <span className="buyer">buyer</span> and{" "}
        <span className="seller">seller</span>; dashed lines are each side&apos;s walk-away. The green ring is the
        deal.
      </p>
      {quality ? (
        <p className="small" style={{ marginTop: "0.4rem" }}>
          The deal captured <span className="mono">{(quality.efficiency * 100).toFixed(0)}%</span> of the best joint
          surplus available,{" "}
          {quality.paretoOptimal ? (
            "and no package was better for both sides."
          ) : (
            <>
              <span className="mono">{quality.paretoDistance.toFixed(3)}</span> from the frontier: a package existed that
              was better for both.
            </>
          )}
        </p>
      ) : null}
      {missed ? (
        <p className="small mute" style={{ marginTop: "0.4rem" }}>
          Before signing, JANG could have proposed{" "}
          <span className="mono">
            {dimensions.map((d) => `${d.label.toLowerCase()} ${missed.terms[d.key]}`).join(", ")}
          </span>{" "}
          (white diamond): <span className="mono">+{missed.buyerGain.toFixed(3)}</span> for the buyer and{" "}
          <span className="mono">+{missed.sellerGain.toFixed(3)}</span> for the seller. It did not, because suggesting it
          would tell each side something about the other&apos;s preferences.
        </p>
      ) : null}
    </div>
  );
}
