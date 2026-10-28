"use client";

/**
 * What this owner's agents are doing right now, in the top bar.
 *
 * It loads after the page paints and refreshes on a timer, so a count can
 * never delay a navigation.
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

  if (!counts) return <span className="pulse" aria-hidden="true" />;

  return (
    <span className="pulse">
      <span className={counts.negotiating > 0 ? "pulse-live" : "faint"}>
        <span className="mono">{counts.negotiating}</span> negotiating
      </span>
      <span className="faint">
        <span className="mono">{counts.agreed}</span> agreed
      </span>
    </span>
  );
}
