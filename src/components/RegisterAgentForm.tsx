"use client";

import Link from "next/link";
/**
 * Registering an agent hands back a key exactly once. The copy block beside it
 * is the MCP configuration, because the next thing anyone does with a new key
 * is try to connect something to it.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterAgentForm({
  refreshOnSuccess = true,
  continueLabel,
}: {
  /** Off when the page would swap this form away and take the key with it. */
  refreshOnSuccess?: boolean;
  /** Shown in the key panel, so the key is read before the page moves on. */
  continueLabel?: string;
} = {}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<{ agentId: string; apiKey: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/owner/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, label }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not register that agent.");
      setIssued(payload);
      setAgentId("");
      setLabel("");
      if (refreshOnSuccess) router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="key-callout">
        <h3>{issued.agentId} is registered</h3>
        <p className="small mute" style={{ margin: "0.3rem 0 0" }}>
          Next, <Link href="/app/mandates/new">give it a mandate</Link> — then JANG can negotiate as this agent on your
          behalf. You do not need the key below for that.
        </p>
        <p className="small mute" style={{ margin: "0.9rem 0 0" }}>
          The key is only for connecting your own software. It is shown once and never again.
        </p>
        <code className="secret">{issued.apiKey}</code>
        <p className="small mute" style={{ margin: "0.75rem 0 0" }}>
          To use it, point an MCP client at JANG:
        </p>
        <pre className="block">
          {JSON.stringify(
            {
              mcpServers: {
                jang: {
                  command: "npx",
                  args: ["tsx", "mcp/server.ts"],
                  env: {
                    JANG_API_URL: "http://localhost:3939",
                    JANG_AGENT_KEY: issued.apiKey,
                  },
                },
              },
            },
            null,
            2,
          )}
        </pre>
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
          {continueLabel ? (
            <button className="button" onClick={() => router.refresh()}>
              {continueLabel}
            </button>
          ) : null}
          <button className="button button-quiet" onClick={() => setIssued(undefined)}>
            Register another agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="field-row">
        <div>
          <label htmlFor="agentId">Name</label>
          <input
            id="agentId"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="buyer-nova"
            pattern="[a-z0-9-]{3,60}"
            aria-describedby="agentId-hint"
            required
          />
          <p className="hint" id="agentId-hint">
            Lowercase letters, numbers and hyphens. The counterparty sees this, so it is the only thing about you they
            learn. It cannot be changed later.
          </p>
        </div>
        <div>
          <label htmlFor="label">What it does</label>
          <input
            id="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Buys household electronics"
            aria-describedby="label-hint"
            required
          />
          <p className="hint" id="label-hint">
            A note to yourself, so you can tell your agents apart. Nobody else sees it.
          </p>
        </div>
      </div>
      {error ? (
        <div className="notice notice-warn" style={{ marginTop: "1rem" }}>
          {error}
        </div>
      ) : null}
      <button className="button" style={{ marginTop: "1rem" }} disabled={busy}>
        {busy ? "Registering…" : "Register agent"}
      </button>
    </form>
  );
}
