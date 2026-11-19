"use client";

/**
 * What an owner does with a closed deal: read it, check it, keep a copy of it,
 * and say whether it actually happened.
 *
 * The signature is verified here rather than reported by the server. The party
 * that signed a document is the last party whose word you should take for
 * whether the signature is good, so the check runs in the reader's browser
 * against the key the instance publishes.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyAgreementHere, type Verification } from "@/lib/browser/verify.ts";
import { HOUSE_OWNER, OUTCOME_COPY, type Mark, type Settlement } from "@/lib/jang/settlement.ts";
import type { Agreement, Dimension } from "@/lib/jang/types.ts";

/** The way a document dates itself, rather than the way a log line does. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function show(dimension: Dimension, value: number): string {
  if (dimension.min === 0 && dimension.max === 1) return value ? "yes" : "no";
  if (dimension.unit === "USD") return `$${value.toLocaleString("en-US")}`;
  return `${value}${dimension.unit ? ` ${dimension.unit}` : ""}`;
}

export function AgreementReceipt({
  agreement,
  settlement,
  dimensions,
  jangPublicKey,
  you,
  title,
}: {
  agreement: Agreement;
  settlement: Settlement;
  dimensions: Dimension[];
  jangPublicKey: string;
  you: { ownerId: string; role: "buyer" | "seller" };
  /** What the item is called, so the document names itself. */
  title: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Verification>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    verifyAgreementHere(agreement, jangPublicKey).then((result) => {
      if (live) setChecked(result);
    });
    return () => {
      live = false;
    };
  }, [agreement, jangPublicKey]);

  const yours = settlement.marks.find((mark) => mark.ownerId === you.ownerId);
  const theirOwnerId = you.role === "buyer" ? settlement.sellerOwnerId : settlement.buyerOwnerId;
  const theirs = settlement.marks.find((mark) => mark.ownerId === theirOwnerId);
  const theyAreHouse = theirOwnerId === HOUSE_OWNER;

  async function mark(choice: Mark) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/owner/agreements/${agreement.agreementId}/mark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mark: choice, note }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        throw new Error(payload?.error?.message ?? "Could not record that.");
      }
      setNote("");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(agreement, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${agreement.agreementId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="section enter">
        {/* The agreement as a document rather than a readout: the thing two
            owners would keep, print or hand to someone who has to act on it.
            Everything on it is from the signed body, nothing is decoration. */}
        <article className="deed">
          <header className="deed-head">
            <p className="deed-kicker">Agreement</p>
            <h2>{title}</h2>
            <p className="deed-sub">
              issued and signed by JANG on {longDate(agreement.agreedAt)}
            </p>
          </header>

          <dl className="deed-meta">
            <div>
              <dt>Reference</dt>
              <dd className="mono">{agreement.agreementId}</dd>
            </div>
            <div>
              <dt>Concluded</dt>
              <dd>
                {new Date(agreement.agreedAt).toLocaleString()} · {agreement.rounds} rounds
              </dd>
            </div>
          </dl>

          <section className="deed-part">
            <h3>The parties</h3>
            <table className="deed-table">
              <tbody>
                <tr>
                  <td className="deed-label">Buyer</td>
                  <td className="mono">{agreement.buyerAgentId}</td>
                  <td className="deed-side">{you.role === "buyer" ? "you" : "the counterparty"}</td>
                </tr>
                <tr>
                  <td className="deed-label">Seller</td>
                  <td className="mono">{agreement.sellerAgentId}</td>
                  <td className="deed-side">{you.role === "seller" ? "you" : "the counterparty"}</td>
                </tr>
              </tbody>
            </table>
            <p className="deed-note">
              Each agent acted for its owner under a mandate lodged with JANG before the negotiation opened. Neither
              owner saw the other&apos;s.
            </p>
          </section>

          <section className="deed-part">
            <h3>The terms agreed</h3>
            <table className="deed-table">
              <tbody>
                {dimensions.map((dimension) => (
                  <tr key={dimension.key}>
                    <td className="deed-label">{dimension.label}</td>
                    <td className="deed-value mono">{show(dimension, agreement.terms[dimension.key]!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="deed-part">
            <h3>Authority</h3>
            <p className="deed-note">
              JANG checked every offer against the mandate of the agent proposing it and refused any that exceeded
              it, including offers from an owner&apos;s own agent. These terms were checked against both of the
              mandates below and lie inside each.
            </p>
            <table className="deed-table">
              <tbody>
                <tr>
                  <td className="deed-label">Buyer&apos;s mandate</td>
                  <td className="mono small">{agreement.buyerMandateId}</td>
                </tr>
                <tr>
                  <td className="deed-label">Seller&apos;s mandate</td>
                  <td className="mono small">{agreement.sellerMandateId}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="deed-part deed-signature">
            <h3>Signature</h3>
            <p className="deed-note">
              Ed25519, by JANG, over the canonical form of everything above. Anyone holding the public key this
              instance publishes at <code>/api/health</code> can check it without an account here.
            </p>
            <code className="deed-sig break">{agreement.signature}</code>
            <p className={`deed-verdict ${checked?.ok ? "is-good" : checked ? "is-bad" : ""}`}>
              {checked === undefined
                ? "Checking the signature in this browser…"
                : checked.ok
                  ? "Verified in your browser against this instance's published key."
                  : checked.otherKey
                    ? "Signed with a key this instance no longer holds, so it cannot be checked here. An instance started without JANG_PRIVATE_KEY mints a new key on every restart."
                    : `This signature did not verify: ${checked.reason}. The terms may have been altered.`}
            </p>
          </section>
        </article>

        <div className="deed-actions">
          <button className="button button-quiet" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          <button className="button button-quiet" onClick={download}>
            Download the signed JSON
          </button>
        </div>
      </section>

      <section className="section enter" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>What became of it</h2>
            <span className="panel-meta">{OUTCOME_COPY[settlement.outcome].label}</span>
          </div>
          <div className="panel-body">
            <p className="hint" style={{ marginTop: 0 }}>
              {OUTCOME_COPY[settlement.outcome].blurb} JANG cannot see whether anyone paid or delivered, so this is
              what the two owners say, not something it has checked.
            </p>

            <dl className="marks">
              <div>
                <dt>You</dt>
                <dd>
                  {yours ? (
                    <>
                      said <strong>{yours.mark === "settled" ? "it settled" : "it fell through"}</strong> on{" "}
                      {new Date(yours.at).toLocaleDateString()}
                      {yours.note ? <span className="brief">{yours.note}</span> : null}
                    </>
                  ) : (
                    <span className="faint">nothing yet</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{theyAreHouse ? "JANG house agent" : "The other owner"}</dt>
                <dd>
                  {theyAreHouse ? (
                    <span className="faint">confirms automatically; it has nothing to deliver</span>
                  ) : theirs ? (
                    <>
                      said <strong>{theirs.mark === "settled" ? "it settled" : "it fell through"}</strong> on{" "}
                      {new Date(theirs.at).toLocaleDateString()}
                      {theirs.note ? <span className="brief">{theirs.note}</span> : null}
                    </>
                  ) : (
                    <span className="faint">nothing yet</span>
                  )}
                </dd>
              </div>
            </dl>

            <label htmlFor="note" style={{ marginTop: "1.1rem", display: "block" }}>
              {yours ? "Change what you said" : "Say what happened"}
            </label>
            <textarea
              id="note"
              rows={2}
              maxLength={400}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional. Paid on the 14th, collected in person."
            />
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button className="button" disabled={busy} onClick={() => mark("settled")}>
                It settled
              </button>
              <button className="button button-quiet" disabled={busy} onClick={() => mark("fell-through")}>
                It fell through
              </button>
            </div>
            <p className="hint">
              You speak only for yourself here. Marking it settled does not mark it settled for the other side, and
              either side saying it fell through is enough to stop it reading as done.
            </p>
            {error ? (
              <div className="notice notice-warn" style={{ marginTop: "0.9rem" }}>
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>The signed document</h2>
            <span className="panel-meta mono">{agreement.agreementId}</span>
          </div>
          <div className="panel-body">
            <div className={`notice ${checked?.ok ? "notice-good" : checked ? "notice-warn" : ""}`}>
              {checked === undefined
                ? "Checking the signature in this browser…"
                : checked.ok
                  ? "Signature verified in your browser against this instance's published key. These terms are the ones JANG signed."
                  : checked.otherKey
                    ? "This agreement was signed with a key this instance no longer holds, so it cannot be checked here. " +
                      "An instance started without JANG_PRIVATE_KEY mints a new signing key on every restart. The terms " +
                      "below are what was recorded; the signature is only as good as the key that signed it."
                    : `This signature did not verify: ${checked.reason}. The terms may have been altered.`}
            </div>

            <table className="table" style={{ marginTop: "1rem" }}>
              <tbody>
                <tr>
                  <td className="mute">Buyer</td>
                  <td className="mono small">{agreement.buyerAgentId}</td>
                </tr>
                <tr>
                  <td className="mute">Seller</td>
                  <td className="mono small">{agreement.sellerAgentId}</td>
                </tr>
                <tr>
                  <td className="mute">Checked against</td>
                  <td className="mono small">
                    {agreement.buyerMandateId}
                    <br />
                    {agreement.sellerMandateId}
                  </td>
                </tr>
                <tr>
                  <td className="mute">Signature</td>
                  <td className="mono small break">{agreement.signature}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button className="button button-quiet" onClick={download}>
                Download the signed agreement
              </button>
            </div>
            <p className="hint">
              The download is the whole document, signature included. Anyone can check it against{" "}
              <code>GET /api/health</code>, which publishes the key, without an account here.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
