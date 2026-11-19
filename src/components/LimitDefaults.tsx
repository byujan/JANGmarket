"use client";

/**
 * An owner's general stance, so setting limits on the twentieth item is not
 * the same work as the first.
 *
 * Nothing here is authority. Only a signed mandate is, and JANG checks offers
 * against that and nothing else. These answers decide where the per-item form
 * starts, and every one of them can be overridden on any item.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerDefaults } from "@/lib/store/types.ts";

export function LimitDefaults({
  initial,
  agents,
}: {
  initial: OwnerDefaults;
  agents: { agentId: string; label?: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<OwnerDefaults>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  const set = (patch: Partial<OwnerDefaults>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/owner/defaults", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        throw new Error(payload?.error?.message ?? "Could not save that.");
      }
      setSaved(true);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Where your limits start</h2>
        <span className="panel-meta">applies to every item</span>
      </div>
      <div className="panel-body">
        <p className="hint" style={{ marginTop: 0 }}>
          Your general stance. Setting limits for an item begins from this instead of a blank form, and anything here
          can be overridden on any item. None of it is authority on its own: only the mandate you sign per item is,
          and that is what JANG checks every offer against.
        </p>

        <div className="field-row">
          <div>
            <label htmlFor="d-agent">Usually act through</label>
            <select
              id="d-agent"
              value={draft.agentId ?? ""}
              onChange={(event) => set({ agentId: event.target.value || undefined })}
            >
              <option value="">No preference</option>
              {agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.label ? `${agent.agentId} · ${agent.label}` : agent.agentId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="d-days">Limits last</label>
            <input
              id="d-days"
              type="number"
              min={1}
              max={365}
              value={draft.expiryDays ?? 7}
              onChange={(event) => set({ expiryDays: Number(event.target.value) || 7 })}
            />
            <p className="hint">Days. A mandate stops being usable once it expires.</p>
          </div>
        </div>

        <label htmlFor="d-money" className="choice">
          <input
            id="d-money"
            type="checkbox"
            checked={draft.moneyFirst ?? false}
            onChange={(event) => set({ moneyFirst: event.target.checked })}
          />
          <span>
            <strong>Start from money.</strong> The questions about what matters most begin with the price term
            rather than whichever one the item happens to list first. It does not answer them for you: a ranking you
            did not make is not a preference, and your agent&apos;s trades are derived from it.
          </span>
        </label>

        <label htmlFor="d-fallback" className="choice">
          <input
            id="d-fallback"
            type="checkbox"
            checked={draft.usuallyNoFallback ?? false}
            onChange={(event) => set({ usuallyNoFallback: event.target.checked })}
          />
          <span>
            <strong>I usually have no fallback.</strong> If a deal falls through there is no other one waiting, so
            your agent should take a thin deal over none.
          </span>
        </label>

        <label htmlFor="d-disclose" className="choice">
          <input
            id="d-disclose"
            type="checkbox"
            checked={draft.disclosePriorities ?? false}
            onChange={(event) => set({ disclosePriorities: event.target.checked })}
          />
          <span>
            <strong>Tell the other side which terms matter most.</strong> The order only, never your numbers. It
            usually finds better trades, and it does tell them where to push.
          </span>
        </label>

        {error ? (
          <div className="notice notice-warn" style={{ marginTop: "0.9rem" }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
          <button className="button" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save these defaults"}
          </button>
          {saved ? <span className="small mute">Saved. New items will start from this.</span> : null}
        </div>
      </div>
    </div>
  );
}
