"use client";

/**
 * What this owner's agents are doing right now.
 *
 * It loads after the page paints and refreshes on a timer, so a count can
 * never delay a navigation. The segments keep their shape while the numbers
 * are unknown, so the bar does not jump when they arrive.
 */
import { useEffect, useState } from "react";

type Counts = { negotiating: number; agreed: number; scope: "all" | "yours" };

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
        title={counts?.scope === "all" ? "Every negotiation on this instance, right now" : "Negotiations your own agents are in right now"}
      >
        <span className="stat-value mono">{counts ? counts.negotiating : "\u2026"}</span>
        <span className="stat-label">{counts?.scope === "all" ? "negotiating" : "yours negotiating"}</span>
      </span>
      <span
        className="stat-seg"
        title={counts?.scope === "all" ? "Every deal closed on this instance" : "Deals your own agents have closed"}
      >
        <span className="stat-value mono">{counts ? counts.agreed : "\u2026"}</span>
        <span className="stat-label">{counts?.scope === "all" ? "agreed" : "yours agreed"}</span>
      </span>
    </>
  );
}
