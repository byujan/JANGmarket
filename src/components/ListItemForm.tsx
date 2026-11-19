"use client";

/**
 * Listing something to negotiate over.
 *
 * Written the way a classified ad is: photographs, a paragraph and a price.
 * JANG builds the price term from that figure, so nobody has to describe a
 * lattice to sell a bicycle. Anything richer than price — delivery, warranty,
 * quantity — is still declared by hand, below and out of the way.
 *
 * Two different things are being described and the form keeps them apart.
 * What is *public*: the terms and the range each may move across, which a
 * counterparty must know to make an offer at all. What stays *private*: how
 * far you would actually go, which is signed separately in your browser.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PHOTOS, prepare, type Photo } from "@/lib/browser/photos.ts";
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

/** Extra terms start empty: most listings are a price and nothing else. */
const starter: Term[] = [];

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
  const [askingPrice, setAskingPrice] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [terms, setTerms] = useState<Term[]>(starter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    const room = MAX_PHOTOS - photos.length;
    try {
      const prepared = await Promise.all([...files].slice(0, room).map(prepare));
      setPhotos((current) => [...current, ...prepared]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }

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
        body: JSON.stringify({
          title,
          description: description || undefined,
          listedRole,
          ...(askingPrice ? { askingPrice: Number(askingPrice) } : {}),
          ...(dimensions.length ? { dimensions } : {}),
          ...(photos.length ? { images: photos.map((photo) => photo.dataUrl) } : {}),
        }),
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
          <label htmlFor="asking">Asking price</label>
          <input
            id="asking"
            type="number"
            min="1"
            step="any"
            inputMode="decimal"
            value={askingPrice}
            onChange={(event) => setAskingPrice(event.target.value)}
            placeholder="500"
            required={terms.length === 0}
            aria-describedby="asking-hint"
          />
          <p className="hint" id="asking-hint">
            In USD. JANG opens the bargaining around this figure — a counterparty can come under it or over it, and
            how far you will actually go stays private.
          </p>
        </div>

        <div style={{ marginTop: "0.9rem" }}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            maxLength={4000}
            placeholder={"54cm aluminium frame, serviced last month. One small scratch on the top tube, shown in the\nlast photo. Comes with the original pedals and a spare tube. Collection from Cambridge, or I can\nmeet somewhere central."}
            aria-describedby="description-hint"
          />
          <p className="hint" id="description-hint">
            Write it the way you would anywhere else. Agents read this, so condition, collection and anything you
            will not budge on are worth saying plainly. {description.length ? `${description.length} of 4000.` : null}
          </p>
        </div>

        <div style={{ marginTop: "0.9rem" }}>
          <label htmlFor="photos">Photographs</label>
          <input
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={photos.length >= MAX_PHOTOS}
            onChange={(event) => {
              void addPhotos(event.target.files);
              event.target.value = "";
            }}
            aria-describedby="photos-hint"
          />
          <p className="hint" id="photos-hint">
            Up to {MAX_PHOTOS}. They are resized in your browser before they are sent, so a photograph straight off a
            phone is fine. The first one is the cover.
          </p>

          {photos.length ? (
            <div className="photos">
              {photos.map((photo, index) => (
                <figure className="photo" key={`${photo.name}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl} alt={`Photograph ${index + 1}: ${photo.name}`} />
                  {index === 0 ? <span className="photo-cover">Cover</span> : null}
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={`Remove photograph ${index + 1}`}
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                  <figcaption>{Math.round(photo.bytes / 1000)} KB</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="section">
        <h2>Anything besides price</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Optional. Price alone is a tug of war: the only way to agree is for someone to give ground. Add a term the
          two sides value differently — a delivery date, a warranty, who collects — and there is something to trade
          instead. Each one is public, because a counterparty has to know what is on the table to make an offer.
        </p>

        {terms.map((term, index) => (
          <div className="band" key={index}>
            <div className="band-head">
              <span className="band-name">{term.label || `Term ${index + 1}`}</span>
              {terms.length >= 1 ? (
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
          disabled={terms.length >= 7}
        >
          {terms.length ? "Add another term" : "Add a term"}
        </button>
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
