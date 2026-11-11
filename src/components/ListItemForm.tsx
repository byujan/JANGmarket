"use client";

/**
 * Listing something to negotiate over.
 *
 * Two different things are being described here and the form keeps them apart.
 * What is *public*: the terms and the range each may move across, which a
 * counterparty must know to make an offer at all. What stays *private*: how
 * far you would actually go, which is signed separately in your browser.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/jang/types.ts";

type Term = {
  key: string;
  label: string;
  unit: string;
  min: string;
  max: string;
  step: string;
  buyerPrefers: "low" | "high";
};

const blank = (): Term => ({ key: "", label: "", unit: "", min: "", max: "", step: "1", buyerPrefers: "low" });

const starter: Term[] = [
  { key: "price", label: "Price", unit: "USD", min: "0", max: "1000", step: "10", buyerPrefers: "low" },
];

/** A key the engine can use, derived from what the person typed. */
function keyFor(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return slug || `term${index + 1}`;
}

export function ListItemForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listedRole, setListedRole] = useState<Role>("seller");
  const [terms, setTerms] = useState<Term[]>(starter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const update = (index: number, patch: Partial<Term>) =>
    setTerms((current) => current.map((term, i) => (i === index ? { ...term, ...patch } : term)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const dimensions = terms.map((term, index) => ({
        key: keyFor(term.label, index),
        label: term.label.trim(),
        ...(term.unit.trim() ? { unit: term.unit.trim() } : {}),
        min: Number(term.min),
        max: Number(term.max),
        step: Number(term.step) || 1,
        buyerPrefers: term.buyerPrefers,
      }));

      const response = await fetch("/api/owner/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description: description || undefined, listedRole, dimensions }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "JANG would not accept this listing.");

      router.push("/app/mandates/new");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section className="section">
        <h2>What it is</h2>
        <div className="field-row">
          <div>
            <label htmlFor="title">Name</label>
            <input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Road bike, barely used"
              minLength={3}
              required
            />
          </div>
          <div>
            <label htmlFor="side">Your side</label>
            <select id="side" value={listedRole} onChange={(event) => setListedRole(event.target.value as Role)}>
              <option value="seller">I am selling it</option>
              <option value="buyer">I am looking to buy it</option>
            </select>
            <p className="hint">The other side is left open for a counterparty.</p>
          </div>
        </div>
        <div style={{ marginTop: "0.9rem" }}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="54cm frame, serviced last month, one small scratch on the top tube."
          />
        </div>
      </section>

      <section className="section">
        <h2>What is negotiable</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Each term and how far it may move. This part is public: a counterparty has to know what is on the table to
          make an offer at all. How far <em>you</em> would actually go stays private, and you sign that next.
        </p>

        {terms.map((term, index) => (
          <div className="band" key={index}>
            <div className="band-head">
              <span className="band-name">{term.label || `Term ${index + 1}`}</span>
              {terms.length > 1 ? (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setTerms((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="field-row">
              <div>
                <label htmlFor={`label-${index}`}>Term</label>
                <input
                  id={`label-${index}`}
                  value={term.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder="Price"
                  required
                />
              </div>
              <div>
                <label htmlFor={`unit-${index}`}>Unit, if any</label>
                <input
                  id={`unit-${index}`}
                  value={term.unit}
                  onChange={(event) => update(index, { unit: event.target.value })}
                  placeholder="USD, days, months"
                />
              </div>
            </div>

            <div className="band-controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <div>
                <label htmlFor={`min-${index}`}>Least</label>
                <input
                  id={`min-${index}`}
                  type="number"
                  value={term.min}
                  onChange={(event) => update(index, { min: event.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor={`max-${index}`}>Most</label>
                <input
                  id={`max-${index}`}
                  type="number"
                  value={term.max}
                  onChange={(event) => update(index, { max: event.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor={`step-${index}`}>Moves in</label>
                <input
                  id={`step-${index}`}
                  type="number"
                  min="0.0001"
                  value={term.step}
                  onChange={(event) => update(index, { step: event.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor={`dir-${index}`}>A buyer wants it</label>
                <select
                  id={`dir-${index}`}
                  value={term.buyerPrefers}
                  onChange={(event) => update(index, { buyerPrefers: event.target.value as "low" | "high" })}
                >
                  <option value="low">as low as possible</option>
                  <option value="high">as high as possible</option>
                </select>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="button button-quiet"
          style={{ marginTop: "1rem" }}
          onClick={() => setTerms((current) => [...current, blank()])}
          disabled={terms.length >= 8}
        >
          Add another term
        </button>
        <p className="hint">
          More terms means more room to trade: a deal that is only about price has nothing to trade against.
        </p>
      </section>

      {error ? (
        <div className="notice notice-warn" style={{ marginTop: "1.25rem" }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="button" disabled={busy}>
          {busy ? "Listing…" : "List it, then set my limits"}
        </button>
        <span className="small faint">Your own limits come next, and are signed in your browser.</span>
      </div>
    </form>
  );
}
