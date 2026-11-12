"use client";

import Link from "next/link";
/**
 * Registering an agent hands back a key exactly once. The copy block beside it
 * is the MCP configuration, because the next thing anyone does with a new key
 * is try to connect something to it.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_POSTURE, POSTURES, POSTURE_COPY, type Posture } from "@/lib/posture.ts";

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
  // Whatever address this page was loaded from, which is the one an agent on
  // this machine can reach. Hardcoding a port sends people to a dead address
  // the moment the server moves.
  const apiUrl = typeof window === "undefined" ? "http://localhost:3939" : window.location.origin;
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [posture, setPosture] = useState<Posture>(DEFAULT_POSTURE);
  const [brief, setBrief] = useState("");
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
        body: JSON.stringify({ agentId, label, posture, brief }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not register that agent.");
      setIssued(payload);
      setAgentId("");
      setLabel("");
      setPosture(DEFAULT_POSTURE);
      setBrief("");
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
          Next, <Link href="/app/mandates/new">give it a mandate</Link>, and JANG can then negotiate as this agent on your
          behalf. You do not need the key below for that.
        </p>
        <p className="small mute" style={{ margin: "0.9rem 0 0" }}>
          The key is only for connecting your own software. It is shown once and never again.
        </p>
        <code className="secret">{issued.apiKey}</code>
        <p className="small mute" style={{ margin: "0.9rem 0 0" }}>
          <strong>Only if you are writing your own agent.</strong> This is MCP configuration: it tells a tool that
          speaks MCP, such as Claude Code or the Claude desktop app, how to reach JANG. Paste it into that tool&apos;s
          MCP settings and its agent gains JANG&apos;s negotiating tools. Nothing here is needed to negotiate from
          this site.
        </p>
        <pre className="block">
          {JSON.stringify(
            {
              mcpServers: {
                jang: {
                  command: "npx",
                  args: ["tsx", "mcp/server.ts"],
                  env: {
                    JANG_API_URL: apiUrl,
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
      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="posture">How hard it bargains</label>
        <select
          id="posture"
          value={posture}
          onChange={(event) => setPosture(event.target.value as Posture)}
          aria-describedby="posture-hint"
        >
          {POSTURES.map((option) => (
            <option key={option} value={option}>
              {POSTURE_COPY[option].label}
            </option>
          ))}
        </select>
        <p className="hint" id="posture-hint">
          {POSTURE_COPY[posture].blurb} This changes how quickly the agent gives ground, never what it is allowed to
          agree to: that is the mandate, and JANG enforces it either way.
        </p>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="brief">Anything else it should know</label>
        <textarea
          id="brief"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Push hard on price but be generous on delivery dates. Never agree to anything that ties us in beyond a year."
          aria-describedby="brief-hint"
        />
        <p className="hint" id="brief-hint">
          Optional, and in your own words. It reaches agents that read prose, which is JANG&apos;s model-driven
          negotiator and any agent of your own you point at JANG. The built-in negotiator the console runs reads the
          dial above rather than this, so say the important things there too.
        </p>
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
