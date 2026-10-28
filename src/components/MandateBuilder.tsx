"use client";

import Link from "next/link";
/**
 * Where a person decides how much authority to hand an agent.
 *
 * Two decisions per term — the line the agent may not cross, and how much the
 * term matters — plus one for the deal as a whole. Everything else the engine
 * needs is derived, because asking an owner for an ideal, a worst case and a
 * weight per dimension is a spreadsheet, not a product.
 *
 * The mandate is signed in this browser. The private key never leaves it.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadOrCreateOwnerKey, isSupported, signMandateBody } from "@/lib/browser/signing.ts";
import type { Dimension, ItemSpec, MandateBody, Role } from "@/lib/jang/types.ts";

export type BuilderItem = { itemSpec: ItemSpec; title: string };

type Setting = { limit: number; importance: number };

/** The end of the range this side is reaching for. */
function idealEnd(dimension: Dimension, role: Role): number {
  const buyerWantsLow = dimension.buyerPrefers !== "high";
  const wantsLow = role === "buyer" ? buyerWantsLow : !buyerWantsLow;
  return wantsLow ? dimension.min : dimension.max;
}

function worstEnd(dimension: Dimension, role: Role): number {
  return idealEnd(dimension, role) === dimension.min ? dimension.max : dimension.min;
}

function describeLimit(dimension: Dimension, role: Role): string {
  const ideal = idealEnd(dimension, role);
  const direction = ideal === dimension.min ? "no more than" : "at least";
  return `${direction}`;
}

function formatValue(dimension: Dimension, value: number): string {
  if (dimension.unit === "USD") return `$${value.toLocaleString("en-US")}`;
  if (dimension.min === 0 && dimension.max === 1) return value ? "yes" : "no";
  return `${value}${dimension.unit ? ` ${dimension.unit}` : ""}`;
}

export function MandateBuilder({
  items,
  agents,
  ownerId,
}: {
  items: BuilderItem[];
  agents: { agentId: string; label?: string }[];
  ownerId: string;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.itemSpec.itemId ?? "");
  const [agentId, setAgentId] = useState(agents[0]?.agentId ?? "");
  const [role, setRole] = useState<Role>("buyer");
  const [walkAway, setWalkAway] = useState(0.3);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const item = items.find((candidate) => candidate.itemSpec.itemId === itemId);
  const dimensions = useMemo(() => item?.itemSpec.dimensions ?? [], [item]);

  // Start every limit at the owner's own worst case: full authority, which
  // they then tighten. Starting tight would hide the dimensions that matter.
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const settingFor = (dimension: Dimension): Setting =>
    settings[`${itemId}:${role}:${dimension.key}`] ?? {
      limit: worstEnd(dimension, role),
      importance: 3,
    };

  const update = (dimension: Dimension, patch: Partial<Setting>) =>
    setSettings((current) => ({
      ...current,
      [`${itemId}:${role}:${dimension.key}`]: { ...settingFor(dimension), ...patch },
    }));

  async function submit() {
    if (!item || !agentId) return;
    setError(undefined);
    setBusy(true);
    try {
      if (!isSupported()) {
        throw new Error("This browser cannot generate signing keys. Try a current Chrome, Safari or Firefox.");
      }

      const constraints: MandateBody["constraints"] = {};
      const preferences: MandateBody["preferences"] = {};

      for (const dimension of dimensions) {
        const setting = settingFor(dimension);
        const ideal = idealEnd(dimension, role);
        const bound = ideal === dimension.min ? { max: setting.limit } : { min: setting.limit };
        constraints[dimension.key] = bound;
        // The limit is also the worst outcome worth having, so the scale the
        // engine scores on matches the one the owner just described.
        preferences[dimension.key] = { weight: setting.importance, ideal, worst: setting.limit };
      }

      const body: MandateBody = {
        mandateId: `mdt_${crypto.randomUUID()}`,
        agentId,
        ownerId,
        role,
        itemId: item.itemSpec.itemId,
        constraints,
        preferences,
        reservationUtility: walkAway,
        expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      };

      const key = await loadOrCreateOwnerKey();
      const signature = await signMandateBody(body, key);

      const response = await fetch("/api/owner/mandates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ownerPublicKey: key.publicKeyPem, signature }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message ?? "JANG would not accept this mandate.");
      }

      router.push("/app");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  if (agents.length === 0) {
    return (
      <div className="empty">
        <strong>Register an agent first</strong>
        A mandate grants authority to a particular agent, so there has to be one to grant it to.{" "}
        <Link href="/app/agents">Register an agent</Link>.
      </div>
    );
  }

  return (
    <>
      <div className="field-row" style={{ marginBottom: "1.25rem" }}>
        <div>
          <label htmlFor="agent">Acting agent</label>
          <select id="agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((agent) => (
              <option key={agent.agentId} value={agent.agentId}>
                {agent.label ? `${agent.label} — ${agent.agentId}` : agent.agentId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="item">Item</label>
          <select id="item" value={itemId} onChange={(event) => setItemId(event.target.value)}>
            {items.map((candidate) => (
              <option key={candidate.itemSpec.itemId} value={candidate.itemSpec.itemId}>
                {candidate.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row" style={{ marginBottom: "1.25rem" }}>
        <div>
          <label htmlFor="role">Side</label>
          <select id="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="buyer">Buying</option>
            <option value="seller">Selling</option>
          </select>
        </div>
        <div>
          <label htmlFor="days">Expires in</label>
          <select id="days" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      <section className="section">
        <h2>What your agent may agree to</h2>
        {dimensions.map((dimension) => {
          const setting = settingFor(dimension);
          const ideal = idealEnd(dimension, role);
          const span = dimension.max - dimension.min || 1;
          const limitAt = ((setting.limit - dimension.min) / span) * 100;
          const idealAt = ((ideal - dimension.min) / span) * 100;
          const left = Math.min(limitAt, idealAt);
          const width = Math.abs(limitAt - idealAt);

          return (
            <div className="band" key={dimension.key}>
              <div className="band-head">
                <span className="band-name">{dimension.label}</span>
                <span className="small mute">
                  {describeLimit(dimension, role)} <span className="mono">{formatValue(dimension, setting.limit)}</span>
                </span>
              </div>

              <div className="band-rail" aria-hidden="true">
                <div className="band-allowed" style={{ left: `${left}%`, width: `${width}%` }} />
                <div className="band-ideal" style={{ left: `calc(${idealAt}% - 1px)` }} />
              </div>
              <div className="band-scale">
                <span className="mono">{formatValue(dimension, dimension.min)}</span>
                <span>lit area is what your agent may offer</span>
                <span className="mono">{formatValue(dimension, dimension.max)}</span>
              </div>

              <div className="band-controls">
                <div>
                  <label htmlFor={`limit-${dimension.key}`}>
                    Your limit — {describeLimit(dimension, role)}
                  </label>
                  <input
                    id={`limit-${dimension.key}`}
                    type="range"
                    min={dimension.min}
                    max={dimension.max}
                    step={dimension.step}
                    value={setting.limit}
                    onChange={(event) => update(dimension, { limit: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor={`weight-${dimension.key}`}>
                    How much it matters — {["barely", "a little", "normally", "a lot", "most of all"][setting.importance - 1]}
                  </label>
                  <input
                    id={`weight-${dimension.key}`}
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={setting.importance}
                    onChange={(event) => update(dimension, { importance: Number(event.target.value) })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h2>When to walk away</h2>
        <p className="small mute">
          Scored across every term, from 0 at your limits to 1 at everything you asked for. Your agent will refuse any
          package below this, and JANG enforces that refusal rather than trusting the agent to behave.
        </p>
        <label htmlFor="walk">
          Walk away below <span className="mono">{walkAway.toFixed(2)}</span>
        </label>
        <input
          id="walk"
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={walkAway}
          onChange={(event) => setWalkAway(Number(event.target.value))}
        />
      </section>

      {error ? (
        <div className="notice notice-warn" style={{ marginTop: "1.5rem" }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: "1.75rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="button" onClick={submit} disabled={busy || !item}>
          {busy ? "Signing in your browser…" : "Sign and lodge mandate"}
        </button>
        <span className="small faint">Signed here; JANG only ever receives your public key.</span>
      </div>
    </>
  );
}
