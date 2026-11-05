"use client";

/**
 * What this owner's agents are doing right now.
 *
 * It loads after the page paints and refreshes on a timer, so a count can
 * never delay a navigation. The segments keep their shape while the numbers
 * are unknown, so the bar does not jump when they arrive.
 */
import { useEffect, useState } from "react";

type Counts = { negotiating: number; agreed: number };

export function Pulse() {
  const [counts, setCounts] = useState<Counts>();

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const response = await fetch("/api/owner/pulse");
        if (!response.ok) return;
        const data = (await response.json()) as Counts;
        if (!cancelled) setCounts(data);
      } catch {
        // A missing count is not worth reporting to anyone.
      }
    };
    read();
    const timer = setInterval(read, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const active = (counts?.negotiating ?? 0) > 0;

  return (
    <>
      <span
        className={`stat-seg${active ? " stat-live" : ""}`}
        title="Negotiations your own agents are in right now"
      >
        <span className="stat-value mono">{counts ? counts.negotiating : "\u2026"}</span>
        <span className="stat-label">yours negotiating</span>
      </span>
      <span className="stat-seg" title="Deals your own agents have closed">
        <span className="stat-value mono">{counts ? counts.agreed : "\u2026"}</span>
        <span className="stat-label">yours agreed</span>
      </span>
    </>
  );
}
