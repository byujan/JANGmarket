"use client";

/**
 * Changing an agent after it was registered.
 *
 * What an owner may change is what they wrote: what it does, how hard it
 * bargains, what they told it. Not the id, which is inside every mandate the
 * agent already holds and those are signed; not the key, of which only a hash
 * was ever kept.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_POSTURE, POSTURES, POSTURE_COPY, type Posture } from "@/lib/posture.ts";
import type { AgentRecord } from "@/lib/store/types.ts";

export function EditAgent({ agent }: { agent: AgentRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(agent.label ?? "");
  const [posture, setPosture] = useState<Posture>(agent.posture ?? DEFAULT_POSTURE);
  const [brief, setBrief] = useState(agent.brief ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** Set once the server has told us what deleting this would cost. */
  const [confirmDelete, setConfirmDelete] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/owner/agents/${encodeURIComponent(agent.agentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, posture, brief }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        throw new Error(payload?.error?.message ?? "Could not save that.");
      }
      setOpen(false);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function remove(confirmed: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/owner/agents/${encodeURIComponent(agent.agentId)}${confirmed ? "?confirm=true" : ""}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => undefined);
      if (response.status === 409 && payload?.error?.code === "CONFIRM_REQUIRED") {
        setConfirmDelete(payload.error.message);
        return;
      }
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not delete that agent.");
      setOpen(false);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="button button-quiet small" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <div className="edit-agent">
      <div>
        <label htmlFor={`label-${agent.agentId}`}>What it does</label>
        <input
          id={`label-${agent.agentId}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
        />
      </div>

      <div>
        <label htmlFor={`posture-${agent.agentId}`}>How hard it bargains</label>
        <select
          id={`posture-${agent.agentId}`}
          value={posture}
          onChange={(event) => setPosture(event.target.value as Posture)}
        >
          {POSTURES.map((option) => (
            <option key={option} value={option}>
              {POSTURE_COPY[option].label}
            </option>
          ))}
        </select>
        <p className="hint">{POSTURE_COPY[posture].blurb}</p>
      </div>

      <div>
        <label htmlFor={`brief-${agent.agentId}`}>Anything else it should know</label>
        <textarea
          id={`brief-${agent.agentId}`}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={3}
          maxLength={600}
        />
        <p className="hint">
          Clearing this withdraws it. Changes apply to negotiations started from now on, never to one already
          running or to a mandate already signed.
        </p>
      </div>

      {error ? <div className="notice notice-warn">{error}</div> : null}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button className="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="button button-quiet" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button
          className="button button-danger"
          style={{ marginLeft: "auto" }}
          onClick={() => void remove(false)}
          disabled={busy}
        >
          Delete
        </button>
      </div>

      {confirmDelete ? (
        <div className="notice notice-warn">
          <p style={{ margin: 0 }}>{confirmDelete}</p>
          <p className="small" style={{ margin: "0.5rem 0 0.75rem" }}>
            The agent, its key and its signed limits go. This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="button button-danger" onClick={() => void remove(true)} disabled={busy}>
              {busy ? "Deleting…" : "Delete it anyway"}
            </button>
            <button className="button button-quiet" onClick={() => setConfirmDelete(undefined)} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
