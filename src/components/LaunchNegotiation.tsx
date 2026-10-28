"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Start a negotiation between one of your agents and the house. */
export function LaunchNegotiation({
  options,
}: {
  options: { agentId: string; itemId: string; itemTitle: string; agentLabel?: string }[];
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function launch() {
    setBusy(true);
    setError(undefined);
    try {
      const option = options[choice];
      const response = await fetch("/api/owner/negotiations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: option.agentId, itemId: option.itemId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not start that negotiation.");
      router.push(`/app/negotiations/${payload.sessionId}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return (
      <div className="empty">
        <strong>Nothing to negotiate yet</strong>
        Your agent needs limits for something it is buying before it can bargain.{" "}
        <Link href="/app/mandates/new">Set your limits</Link>. Note that the house always sells, so limits you set
        for selling will not appear here.
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="pairing">Agent and item</label>
      <select id="pairing" value={choice} onChange={(event) => setChoice(Number(event.target.value))}>
        {options.map((option, index) => (
          <option key={`${option.agentId}:${option.itemId}`} value={index}>
            {option.agentLabel ?? option.agentId} — {option.itemTitle}
          </option>
        ))}
      </select>
      {error ? (
        <div className="notice notice-warn" style={{ marginTop: "1rem" }}>
          {error}
        </div>
      ) : null}
      <button className="button" style={{ marginTop: "1rem" }} onClick={launch} disabled={busy}>
        {busy ? "Opening session…" : "Start negotiating"}
      </button>
      <p className="small faint" style={{ marginTop: "0.6rem" }}>
        The seller side is JANG&apos;s house agent, bargaining under its own signed mandate.
      </p>
    </div>
  );
}
