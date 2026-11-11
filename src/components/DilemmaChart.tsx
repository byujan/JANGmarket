/**
 * The negotiator's dilemma, plotted.
 *
 * Every closed deal is one point: how much joint value the pair created,
 * against how that value was split. The course frames these as the two things
 * a negotiator is doing at once and often trading against each other, so
 * putting them on the same axes is the whole point.
 *
 * Both numbers come from the two private mandates, so this is operator-only.
 *
 * Points carry aria-label rather than an SVG <title>: React treats <title> as
 * document metadata and hoists it out of the chart, which leaves the server
 * and client markup disagreeing. The cost is the loss of a native hover
 * tooltip, which would need client state to replace.
 */
import type { DilemmaPoint } from "@/lib/jang/analysis.ts";

export type { DilemmaPoint };

function describe(p: DilemmaPoint): string {
  const created = `created ${(p.created * 100).toFixed(0)}% of what was available`;
  const claimed = `buyer took ${(p.claimed * 100).toFixed(0)}% of it`;
  return `${p.itemTitle}: ${created}, ${claimed}${p.paretoOptimal ? ", on the frontier" : ""}`;
}

export function DilemmaChart({ points }: { points: DilemmaPoint[] }) {
  const w = 560;
  const h = 300;
  const pad = { l: 52, r: 18, t: 18, b: 42 };
  const x = (v: number) => pad.l + v * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - v * (h - pad.t - pad.b);

  if (points.length === 0) {
    return (
      <div className="empty">
        <strong>No closed deals yet</strong>
        Each deal appears here as a point once it is agreed.
      </div>
    );
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Value created against value claimed, one point per closed deal">
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {t.toFixed(2)}
            </text>
            <text x={x(t)} y={h - pad.b + 18} textAnchor="middle" className="chart-tick">
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {/* An even split is the line a fair deal sits on. */}
        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={y(0.5)}
          y2={y(0.5)}
          stroke="var(--faint)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text x={w - pad.r} y={y(0.5) - 6} textAnchor="end" className="chart-note">
          even split
        </text>

        {/* Everything that could have been created but was not. */}
        <rect
          x={x(0)}
          y={pad.t}
          width={x(0.75) - x(0)}
          height={h - pad.t - pad.b}
          fill="var(--deny)"
          opacity="0.05"
        />
        <text x={x(0.02)} y={pad.t + 14} className="chart-note">
          value left on the table
        </text>

        {points.map((p, i) => (
          <g
            key={p.sessionId}
            className="chart-point"
            style={{ "--i": i } as React.CSSProperties}
            role="img"
            aria-label={describe(p)}
          >
            <circle
              cx={x(p.created)}
              cy={y(p.claimed)}
              r={p.paretoOptimal ? 6 : 4.5}
              fill={p.paretoOptimal ? "var(--agree)" : "var(--buyer)"}
              fillOpacity={p.paretoOptimal ? 0.9 : 0.55}
              stroke={p.paretoOptimal ? "var(--agree)" : "var(--buyer)"}
              strokeWidth="1.5"
            />
          </g>
        ))}

        <text x={(w - pad.l) / 2 + pad.l} y={h - 6} textAnchor="middle" className="chart-axis">
          value created (share of the most available)
        </text>
        <text x={14} y={h / 2} textAnchor="middle" transform={`rotate(-90 14 ${h / 2})`} className="chart-axis">
          value claimed by the buyer
        </text>
      </svg>

      <figcaption className="chart-legend">
        <span>
          <i className="dot dot-agree" /> on the Pareto frontier
        </span>
        <span>
          <i className="dot dot-buyer" /> below it, value was available and missed
        </span>
      </figcaption>
    </figure>
  );
}
