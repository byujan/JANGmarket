"use client";

/**
 * Listing something to negotiate over.
 *
 * Written the way a classified ad is: photographs, a paragraph and a price.
 * JANG builds the price term from that figure, so nobody has to describe a
 * lattice to sell a bicycle.
 *
 * Anything else the lister is open to is prose, handed to the negotiating
 * agents as context. That is a real trade: a declared term is enforced and
 * signed into the agreement, while a sentence about the lock being included
 * is only something the agents may talk about and trade on.
 *
 * What stays private either way is how far you would actually go, which is
 * signed separately in your browser.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PHOTOS, prepare, type Photo } from "@/lib/browser/photos.ts";
import type { Dimension, Role } from "@/lib/jang/types.ts";

type Suggested = Dimension & { because: string };

export function ListItemForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listedRole, setListedRole] = useState<Role>("seller");
  const [askingPrice, setAskingPrice] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [termsNote, setTermsNote] = useState("");
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string>();

  async function suggest() {
    setSuggesting(true);
    setSuggestNote(undefined);
    try {
      const response = await fetch("/api/owner/items/suggest-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, termsNote, listedRole }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not read that.");
      setSuggested(payload.terms ?? []);
      setChosen(new Set((payload.terms ?? []).map((term: Suggested) => term.key)));
      if (payload.unavailable) {
        setSuggestNote("Claude could not be reached, so nothing was read. You can still list it on price alone.");
      } else if (!payload.terms?.length) {
        setSuggestNote("Nothing in what you wrote reads as negotiable besides price.");
      }
    } catch (problem) {
      setSuggestNote(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setSuggesting(false);
    }
  }
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/owner/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          listedRole,
          askingPrice: Number(askingPrice),
          ...(termsNote.trim() ? { termsNote } : {}),
          ...(chosen.size
            ? {
                dimensions: suggested
                  .filter((term) => chosen.has(term.key))
                  .map(({ because: _because, ...dimension }) => dimension),
              }
            : {}),
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
            required
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
          Optional, and in your own words. Both agents read this before they start, so it is the place to say what
          else you would move on — delivery, collection, what you would throw in, what you will not budge on.
        </p>
        <textarea
          id="termsNote"
          value={termsNote}
          onChange={(event) => setTermsNote(event.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={"Happy to include the lock and the spare tube if you collect this week.\nI can deliver within Cambridge for a bit more. The frame size is not negotiable."}
          aria-describedby="terms-hint"
        />
        <p className="hint" id="terms-hint">
          This is context, not a term. JANG enforces the price and signs it into the agreement; anything here is
          something the agents can talk about and trade on, but nothing holds them to it.
        </p>

        <div style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void suggest()}
            disabled={suggesting || !title.trim()}
          >
            {suggesting ? "Reading what you wrote…" : "Read this and suggest terms"}
          </button>
          <p className="hint">
            A deal about price alone is a tug of war: every pound one side gains, the other loses. A second term the
            two of you value differently is what makes a trade possible. Claude reads your advertisement and proposes
            what it offers; nothing is added unless you keep it.
          </p>
        </div>

        {suggestNote ? (
          <div className="notice" style={{ marginTop: "0.75rem" }}>
            {suggestNote}
          </div>
        ) : null}

        {suggested.length ? (
          <div className="suggested">
            {suggested.map((term) => (
              <label className="choice" key={term.key}>
                <input
                  type="checkbox"
                  checked={chosen.has(term.key)}
                  onChange={(event) =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(term.key);
                      else next.delete(term.key);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>{term.label}</strong>{" "}
                  <span className="mono small">
                    {term.min === 0 && term.max === 1
                      ? "yes or no"
                      : `${term.min}–${term.max}${term.unit ? ` ${term.unit}` : ""}`}
                  </span>
                  <span className="brief">“{term.because}”</span>
                </span>
              </label>
            ))}
            <p className="hint">
              Kept terms are enforced: JANG refuses offers outside their range and signs them into the agreement
              alongside the price. Untick anything you did not mean.
            </p>
          </div>
        ) : null}
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
