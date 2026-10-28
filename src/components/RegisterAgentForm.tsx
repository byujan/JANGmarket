"use client";

/**
 * Registering an agent hands back a key exactly once. The copy block beside it
 * is the MCP configuration, because the next thing anyone does with a new key
 * is try to connect something to it.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterAgentForm() {
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
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="key-callout">
        <h3>Key for {issued.agentId}</h3>
        <p className="small mute" style={{ margin: "0.3rem 0 0" }}>
          This is the only time it is shown. Store it somewhere your agent can read.
        </p>
        <code className="secret">{issued.apiKey}</code>
        <p className="small mute" style={{ margin: "0.75rem 0 0" }}>
          Point an MCP client at JANG with it:
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
        <button className="button button-quiet" style={{ marginTop: "0.9rem" }} onClick={() => setIssued(undefined)}>
          Register another agent
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="field-row">
        <div>
          <label htmlFor="agentId">Agent id</label>
          <input
            id="agentId"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="buyer-nova"
            pattern="[a-z0-9-]{3,60}"
            required
          />
        </div>
        <div>
          <label htmlFor="label">What it does</label>
          <input
            id="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Buys household electronics"
            required
          />
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
