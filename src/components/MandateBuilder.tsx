"use client";

import Link from "next/link";
/**
 * Where a person decides how much authority to hand an agent.
 *
 * One decision per term, the line the agent may not cross. How much each term
 * matters comes from a few "which would you rather have" choices, then (when
 * one term is money) what each other term is worth in money, so the weights
 * carry size as well as order. When to walk away comes from what the owner
 * would do instead. Everything else the
 * engine needs is derived, because asking an owner for weights and a 0..1
 * reservation value is a spreadsheet, not a product.
 *
 * The mandate is signed in this browser. The private key never leaves it.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RegisterAgentForm } from "./RegisterAgentForm.tsx";
import { loadOrCreateOwnerKey, isSupported, signMandateBody } from "@/lib/browser/signing.ts";
import {
  answerComparison,
  comparisonPackages,
  isComplete,
  maxQuestions,
  nextComparison,
  reservationFromAlternative,
  startRanking,
  swingConflicts,
  weightsFromRanking,
  weightsFromSwings,
  type Ranking,
} from "@/lib/jang/elicit.ts";
import type { Dimension, ItemSpec, MandateBody, Role } from "@/lib/jang/types.ts";

export type BuilderItem = { itemSpec: ItemSpec; title: string };

type Setting = { limit: number };

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
  const [days, setDays] = useState(7);
  const [disclose, setDisclose] = useState(false);
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
    };

  const update = (dimension: Dimension, patch: Partial<Setting>) =>
    setSettings((current) => ({
      ...current,
      [`${itemId}:${role}:${dimension.key}`]: { ...settingFor(dimension), ...patch },
    }));

  // Importance, by choice rather than by slider.
  const scope = `${itemId}:${role}`;
  const [rankings, setRankings] = useState<Record<string, Ranking>>({});
  const ranking = rankings[scope] ?? startRanking(dimensions.map((d) => d.key));
  const question = nextComparison(ranking);
  const answer = (candidateMatters: boolean) =>
    setRankings((current) => ({ ...current, [scope]: answerComparison(ranking, candidateMatters) }));
  const restartRanking = () => setRankings((current) => ({ ...current, [scope]: startRanking(dimensions.map((d) => d.key)) }));
  const anchors = Object.fromEntries(
    dimensions.map((d) => [d.key, { ideal: idealEnd(d, role), limit: settingFor(d).limit }]),
  );
  const byKey = (key: string) => dimensions.find((d) => d.key === key)!;
  const describePackage = (terms: Record<string, number>) =>
    Object.entries(terms)
      .map(([key, value]) => `${byKey(key).label.toLowerCase()} ${formatValue(byKey(key), value)}`)
      .join(", ");

  // How much, in money: what each other term is worth, limit to best.
  const money = dimensions.find((d) => d.unit === "USD");
  const [swingAnswers, setSwingAnswers] = useState<Record<string, Record<string, string>>>({});
  const swingInput = swingAnswers[scope] ?? {};
  const setSwing = (dimension: Dimension, value: string) =>
    setSwingAnswers((current) => ({ ...current, [scope]: { ...swingInput, [dimension.key]: value } }));
  const swingWeights = money
    ? weightsFromSwings(
        money.key,
        Object.fromEntries(
          dimensions.filter((d) => d.key !== money.key).map((d) => [d.key, swingInput[d.key]?.trim() ? Number(swingInput[d.key]) : undefined]),
        ),
        anchors,
      )
    : undefined;
  const conflicts = swingWeights && isComplete(ranking) ? swingConflicts(ranking.ranked, swingWeights) : [];

  // When to walk away, from what the owner would do instead.
  const [alternatives, setAlternatives] = useState<Record<string, Record<string, number>>>({});
  const [noAlternatives, setNoAlternatives] = useState<Record<string, boolean>>({});
  const alternative = alternatives[scope] ?? {};
  const noAlternative = noAlternatives[scope] ?? false;
  const alternativeValue = (dimension: Dimension) => alternative[dimension.key] ?? settingFor(dimension).limit;
  const setAlternative = (dimension: Dimension, value: number) =>
    setAlternatives((current) => ({ ...current, [scope]: { ...alternative, [dimension.key]: value } }));

  /** Preferences as the engine scores them: ideal at the far end, worst at the owner's limit. */
  function preferencesFor(): MandateBody["preferences"] {
    // Money answers carry size, so they win; the ranking alone only carries order.
    const weights = swingWeights ?? (isComplete(ranking) ? weightsFromRanking(ranking.ranked) : {});
    const preferences: MandateBody["preferences"] = {};
    for (const dimension of dimensions) {
      preferences[dimension.key] = {
        weight: weights[dimension.key] ?? 1,
        ideal: idealEnd(dimension, role),
        worst: settingFor(dimension).limit,
      };
    }
    return preferences;
  }

  async function submit() {
    if (!item || !agentId) return;
    setError(undefined);
    setBusy(true);
    try {
      if (!isSupported()) {
        throw new Error("This browser cannot generate signing keys. Try a current Chrome, Safari or Firefox.");
      }

      const constraints: MandateBody["constraints"] = {};
      const preferences = preferencesFor();

      for (const dimension of dimensions) {
        const setting = settingFor(dimension);
        const ideal = idealEnd(dimension, role);
        const bound = ideal === dimension.min ? { max: setting.limit } : { min: setting.limit };
        constraints[dimension.key] = bound;
      }

      // The reservation value is what the owner's best alternative is worth to
      // them. They never see or set the number itself.
      const walkAway = noAlternative
        ? 0
        : reservationFromAlternative(
            Object.fromEntries(dimensions.map((d) => [d.key, alternativeValue(d)])),
            preferences,
          );
      if (walkAway >= 0.95) {
        throw new Error(
          "Your alternative is about as good as the best you could get here, so your agent could never agree to anything. Loosen the alternative, or your limits.",
        );
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
        // Only present when chosen, so an undisclosed mandate signs exactly as before.
        ...(disclose ? { disclosePriorities: true } : {}),
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
    // Limits are granted to a particular agent, so there has to be one. Asking
    // for it here beats sending someone away from the page they wanted.
    return (
      <>
        <div className="notice" style={{ marginBottom: "1.5rem" }}>
          Limits are granted to a particular agent, so name one first. It takes a moment, and then you can set what it
          is allowed to agree to.
        </div>
        <RegisterAgentForm refreshOnSuccess={false} continueLabel="Continue to your limits" />
      </>
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
                {agent.label ? `${agent.label} (${agent.agentId})` : agent.agentId}
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
        <p className="hint" style={{ marginBottom: "0.5rem" }}>
          Drag each limit to the furthest you would go. The lit band is the ground your agent may move on; the hatched
          part is off limits, and JANG will refuse any offer that lands there.
        </p>
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
                    Your limit: {describeLimit(dimension, role)}
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
              </div>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h2>What matters most</h2>
        <p className="small mute">
          A few quick choices instead of weights. Each pair differs on two terms only; everything else is the same.
        </p>
        {question ? (
          <div className="choice">
            <p className="small faint" style={{ margin: "0 0 0.5rem" }}>
              Question {ranking.asked + 1} of at most {maxQuestions(dimensions.length)}. Which would you rather have?
            </p>
            {(() => {
              const pair = comparisonPackages(question.candidate, question.against, anchors);
              return (
                <div className="field-row">
                  <button type="button" className="button button-quiet" onClick={() => answer(true)}>
                    {describePackage(pair.candidateFirst)}
                  </button>
                  <button type="button" className="button button-quiet" onClick={() => answer(false)}>
                    {describePackage(pair.againstFirst)}
                  </button>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="small">
            Most to least important:{" "}
            <span className="mono">{ranking.ranked.map((key) => byKey(key).label.toLowerCase()).join(" > ")}</span>.{" "}
            <button type="button" className="link-button small" onClick={restartRanking}>
              Answer again
            </button>
          </p>
        )}
        {question && ranking.asked === 0 ? (
          <p className="small faint" style={{ marginTop: "0.5rem" }}>
            Skip this and every term counts the same.
          </p>
        ) : null}
      </section>

      {money ? (
        <section className="section">
          <h2>How much is each worth to you?</h2>
          <p className="small mute">
            The order says what matters more, not how much more. For each term, how much {role === "buyer" ? "more would you pay" : "less would you accept"} to get
            your best instead of your limit? A rough figure is fine. Skip this and the order alone sets the weights.
          </p>
          <div className="field-row">
            {dimensions
              .filter((dimension) => dimension.key !== money.key)
              .map((dimension) => (
                <div key={dimension.key}>
                  <label htmlFor={`swing-${dimension.key}`}>
                    {dimension.label}: {formatValue(dimension, anchors[dimension.key].limit)} → {formatValue(dimension, anchors[dimension.key].ideal)}
                  </label>
                  <input
                    id={`swing-${dimension.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={10}
                    placeholder="$"
                    value={swingInput[dimension.key] ?? ""}
                    onChange={(event) => setSwing(dimension, event.target.value)}
                  />
                </div>
              ))}
          </div>
          <p className="small faint" style={{ marginTop: "0.5rem" }}>
            For scale: your whole {money.label.toLowerCase()} range, {formatValue(money, anchors[money.key].limit)} to{" "}
            {formatValue(money, anchors[money.key].ideal)}, is worth{" "}
            {formatValue(money, Math.abs(anchors[money.key].limit - anchors[money.key].ideal))} to you by definition.
          </p>
          {conflicts.length ? (
            <div className="notice" style={{ marginTop: "0.75rem" }}>
              These amounts disagree with your choices above:{" "}
              {conflicts.map((c) => `${byKey(c.more).label.toLowerCase()} over ${byKey(c.less).label.toLowerCase()}`).join("; ")}. The amounts
              are used; change them, or answer the choices again, if that is not what you meant.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="section">
        <h2>If this falls through</h2>
        <p className="small mute">
          What would you do instead? Describe the best deal you could get elsewhere. Your agent will only agree to
          something at least as good for you as that.
        </p>
        <label htmlFor="no-alternative" style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <input
            id="no-alternative"
            type="checkbox"
            checked={noAlternative}
            onChange={(event) => setNoAlternatives((current) => ({ ...current, [scope]: event.target.checked }))}
          />
          <span className="small">I have no other option; anything within my limits is better than nothing.</span>
        </label>
        {noAlternative ? null : (
          <div className="field-row">
            {dimensions.map((dimension) => (
              <div key={dimension.key}>
                <label htmlFor={`alt-${dimension.key}`}>{dimension.label}</label>
                {dimension.min === 0 && dimension.max === 1 ? (
                  <select
                    id={`alt-${dimension.key}`}
                    value={alternativeValue(dimension)}
                    onChange={(event) => setAlternative(dimension, Number(event.target.value))}
                  >
                    <option value={1}>yes</option>
                    <option value={0}>no</option>
                  </select>
                ) : (
                  <input
                    id={`alt-${dimension.key}`}
                    type="number"
                    min={dimension.min}
                    max={dimension.max}
                    step={dimension.step}
                    value={alternativeValue(dimension)}
                    onChange={(event) => setAlternative(dimension, Number(event.target.value))}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Tell the other side what matters</h2>
        <label htmlFor="disclose" style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
          <input id="disclose" type="checkbox" checked={disclose} onChange={(event) => setDisclose(event.target.checked)} />
          <span>
            Share the order of importance of these terms with the counterparty&apos;s agent, so it can offer you more of
            what you care about. Only the order is shared: never your limits, how much more one term matters than
            another, or when you would walk away.
          </span>
        </label>
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
