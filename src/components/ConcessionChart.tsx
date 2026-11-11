/**
 * Each side's own valuation of its own successive offers.
 *
 * Class 3 treats a shrinking step as a signal: "declining magnitude of
 * concessions is an unspoken signal to suggest closeness to the reservation
 * price". Drawn against each owner's walk-away line, the two lines show how
 * much room was left and who spent it.
 *
 * Computed from both mandates, so operator-only.
 */
import type { ConcessionPoint } from "@/lib/jang/analysis.ts";

export function ConcessionChart({
  buyer,
  seller,
  buyerReservation,
  sellerReservation,
  maxRounds,
}: {
  buyer: ConcessionPoint[];
  seller: ConcessionPoint[];
  buyerReservation: number;
  sellerReservation: number;
  maxRounds: number;
}) {
  const w = 560;
  const h = 260;
  const pad = { l: 46, r: 18, t: 16, b: 38 };
  const lastRound = Math.max(maxRounds, ...buyer.map((p) => p.round), ...seller.map((p) => p.round), 1);
  const x = (round: number) => pad.l + ((round - 1) / Math.max(1, lastRound - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - v * (h - pad.t - pad.b);

  if (buyer.length === 0 && seller.length === 0) {
    return (
      <div className="empty">
        <strong>No offers yet</strong>
        Each side&apos;s concessions appear here as it moves.
      </div>
    );
  }

  const path = (points: ConcessionPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.round)} ${y(p.toSelf)}`).join(" ");

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Each side's valuation of its own offers, by round">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {t}
            </text>
          </g>
        ))}

        {/* Walk-away lines: below its own, a side would rather have no deal. */}
        <line x1={pad.l} x2={w - pad.r} y1={y(buyerReservation)} y2={y(buyerReservation)} stroke="var(--buyer)" strokeDasharray="4 4" opacity="0.5" />
        <line x1={pad.l} x2={w - pad.r} y1={y(sellerReservation)} y2={y(sellerReservation)} stroke="var(--seller)" strokeDasharray="4 4" opacity="0.5" />

        <path d={path(buyer)} fill="none" stroke="var(--buyer)" strokeWidth="2" className="chart-line" />
        <path d={path(seller)} fill="none" stroke="var(--seller)" strokeWidth="2" className="chart-line" />

        {buyer.map((p) => (
          <circle
            key={`b${p.round}`}
            cx={x(p.round)}
            cy={y(p.toSelf)}
            r="3.5"
            fill="var(--buyer)"
            role="img"
            aria-label={`Buyer round ${p.round}: worth ${p.toSelf.toFixed(2)} to itself, gave up ${p.conceded.toFixed(2)}`}
          />
        ))}
        {seller.map((p) => (
          <circle
            key={`s${p.round}`}
            cx={x(p.round)}
            cy={y(p.toSelf)}
            r="3.5"
            fill="var(--seller)"
            role="img"
            aria-label={`Seller round ${p.round}: worth ${p.toSelf.toFixed(2)} to itself, gave up ${p.conceded.toFixed(2)}`}
          />
        ))}

        <text x={(w - pad.l) / 2 + pad.l} y={h - 6} textAnchor="middle" className="chart-axis">
          round
        </text>
        <text x={12} y={h / 2} textAnchor="middle" transform={`rotate(-90 12 ${h / 2})`} className="chart-axis">
          worth to the side offering it
        </text>
      </svg>

      <figcaption className="chart-legend">
        <span>
          <i className="dot dot-buyer" /> buyer
        </span>
        <span>
          <i className="dot dot-seller" /> seller
        </span>
        <span className="faint">dashed: each side&apos;s walk-away</span>
      </figcaption>
    </figure>
  );
}
