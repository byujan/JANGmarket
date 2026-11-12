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
}: {
  agreement: Agreement;
  settlement: Settlement;
  dimensions: Dimension[];
  jangPublicKey: string;
  you: { ownerId: string; role: "buyer" | "seller" };
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
        <div className="panel">
          <div className="panel-head">
            <h2>Terms</h2>
            <span className="panel-meta">
              closed in {agreement.rounds} rounds, {new Date(agreement.agreedAt).toLocaleString()}
            </span>
          </div>
          <table className="table">
            <tbody>
              {dimensions.map((dimension) => (
                <tr key={dimension.key}>
                  <td className="mute">{dimension.label}</td>
                  <td className="mono">{show(dimension, agreement.terms[dimension.key]!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
