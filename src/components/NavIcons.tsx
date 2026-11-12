/**
 * Nav icons.
 *
 * One flat set: a 16px box, 1.5 stroke, no fills, drawn in currentColor so
 * each one takes the colour of the link it sits in and the current page's
 * icon brightens with its label. They are decorative — the label beside each
 * one is the real name — so they are hidden from assistive technology.
 */
const common = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Console: panels, the way the console is laid out. */
export function ConsoleIcon() {
  return (
    <svg {...common}>
      <rect x="2" y="2.5" width="5" height="5" rx="1" />
      <rect x="9" y="2.5" width="5" height="5" rx="1" />
      <rect x="2" y="9.5" width="12" height="4" rx="1" />
    </svg>
  );
}

/** Agents: a figure, because an agent stands in for someone. */
export function AgentsIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M2.75 13.5a5.25 5.25 0 0 1 10.5 0" />
    </svg>
  );
}

/** Market: a stall's awning over goods. */
export function MarketIcon() {
  return (
    <svg {...common}>
      <path d="M2 6h12l-1 7.5H3L2 6Z" />
      <path d="M5.5 6V4a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/** List an item: a tag, which is what listing something puts on it. */
export function ListIcon() {
  return (
    <svg {...common}>
      <path d="M8.2 2.2H13a.8.8 0 0 1 .8.8v4.8a1 1 0 0 1-.3.7l-5.3 5.3a1 1 0 0 1-1.4 0L2.4 9.2a1 1 0 0 1 0-1.4l5.1-5.3a1 1 0 0 1 .7-.3Z" />
      <circle cx="10.8" cy="5.2" r="1" />
    </svg>
  );
}

/** Limits: a gauge stopped short of the end, which is what a mandate is. */
export function LimitsIcon() {
  return (
    <svg {...common}>
      <path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" />
      <path d="M8 11.5 11 7" />
    </svg>
  );
}

/** Negotiations: two sides passing offers back and forth. */
export function NegotiationsIcon() {
  return (
    <svg {...common}>
      <path d="M2.5 5.5h9M9 3l2.5 2.5L9 8" />
      <path d="M13.5 10.5h-9M7 8l-2.5 2.5L7 13" />
    </svg>
  );
}

/** Operations: activity across the instance. */
export function OperationsIcon() {
  return (
    <svg {...common}>
      <path d="M1.75 8.5h3L6.5 4l3 8 1.75-3.5h3" />
    </svg>
  );
}
