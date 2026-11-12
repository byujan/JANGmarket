"use client";

/**
 * One negotiation, watched as it happens.
 *
 * The server sends the whole redacted view on every change rather than a
 * delta. A negotiation is a few dozen offers at most, so the simpler contract
 * is worth more than the bytes saved, and a reconnecting browser is always
 * correct rather than mid-replay.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SessionView } from "@/lib/jang/session.ts";
import type { Agreement } from "@/lib/jang/types.ts";
import { utility } from "@/lib/jang/utility.ts";
import { ConvergenceLadder } from "./ConvergenceLadder.tsx";

type Payload = { view: SessionView; agreement?: Agreement };

type Connection = "connecting" | "live" | "closed" | "error";

export function LiveNegotiation({ sessionId, initial }: { sessionId: string; initial: Payload }) {
  const [payload, setPayload] = useState<Payload>(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const latest = useRef(payload);
  latest.current = payload;

  useEffect(() => {
    if (initial.view.status !== "open") {
      setConnection("closed");
      return;
    }
    const source = new EventSource(`/api/owner/stream/${sessionId}`);
    source.onopen = () => setConnection("live");
    source.addEventListener("update", (event) => {
      setPayload(JSON.parse((event as MessageEvent).data) as Payload);
    });
    source.addEventListener("done", () => {
      setConnection("closed");
      source.close();
    });
    source.onerror = () => {
      setConnection(latest.current.view.status === "open" ? "error" : "closed");
      source.close();
    };
    return () => source.close();
  }, [sessionId, initial.view.status]);

  const { view, agreement } = payload;
  const mandate = view.yourMandate;
  const standing = view.standingOffer;
  const packages = standing ? [standing, ...(standing.alternatives ?? [])] : [];
  // With several packages on the table, the one that matters to you is the best one.
  const standingValue = packages.length ? Math.max(...packages.map((p) => utility(p.terms, mandate))) : undefined;

  return (
    <>
      <div className="row-between" style={{ marginBottom: "1rem" }}>
        <div>
          <h2>{view.itemSpec.title}</h2>
          <p className="small mute" style={{ margin: "0.2rem 0 0" }}>
            You are the <span className={view.you.role}>{view.you.role}</span>. Round {view.roundsUsed} of{" "}
            {view.maxRounds}.
          </p>
        </div>
        <StatusChip status={view.status} connection={connection} />
      </div>

      <ConvergenceLadder
        dimensions={view.itemSpec.dimensions}
        offers={view.offers}
        buyerAgentId={view.you.role === "buyer" ? view.you.agentId : view.counterparty.agentId}
        agreedOfferId={agreement?.offerId}
      />

      <p className="hint" style={{ marginTop: "0.75rem" }}>
        Each row is one offer. The buyer reaches in from the left and the seller from the right, both stopping at the
        price they named, so the gap between them is what is left to bridge. The terms beside each bar are the rest of
        the package, and that is where the trading happens.
      </p>

      {view.status === "open" && standingValue !== undefined ? (
        <p className="small mute" style={{ marginTop: "0.9rem" }}>
          {packages.length > 1 ? `The best of the ${packages.length} packages on the table` : "The package on the table"} is worth{" "}
          <span className="mono">{standingValue.toFixed(2)}</span> to you, against the{" "}
          <span className="mono">{mandate.reservationUtility}</span> your mandate says is the least you would accept.
        </p>
      ) : null}

      {agreement ? <AgreementPanel agreement={agreement} view={view} /> : null}

      {view.status === "expired" || view.status === "failed" ? (
        <div className="notice notice-warn" style={{ marginTop: "1.25rem" }}>
          This negotiation ended without a deal. Neither owner is bound to anything.
        </div>
      ) : null}
    </>
  );
}

function StatusChip({ status, connection }: { status: SessionView["status"]; connection: Connection }) {
  if (status === "open") {
    const text =
      connection === "live"
        ? "Live"
        : connection === "connecting"
          ? "Connecting"
          : connection === "error"
            ? "Reconnect to follow along"
            : "Open";
    return <span className={`tag tag-open${connection === "live" ? " tag-pulse" : ""}`}>{text}</span>;
  }
  return <span className={`tag tag-${status}`}>{status}</span>;
}

function AgreementPanel({ agreement, view }: { agreement: Agreement; view: SessionView }) {
  const value = utility(agreement.terms, view.yourMandate);
  return (
    <section className="section enter">
      <div className="panel">
        <div className="panel-head">
          <h2>Agreement</h2>
          <span className="panel-meta mono">{agreement.agreementId}</span>
        </div>
        <div className="panel-body">
      <div className="notice notice-good">
        Closed in {agreement.rounds} rounds and signed by JANG. Worth{" "}
        <span className="mono">{value.toFixed(2)}</span> to you, above your reservation of{" "}
        <span className="mono">{view.yourMandate.reservationUtility}</span>.
      </div>

      <table className="table" style={{ marginTop: "1rem" }}>
        <tbody>
          {view.itemSpec.dimensions.map((dimension) => (
            <tr key={dimension.key}>
              <th scope="row" style={{ width: "40%" }}>
                {dimension.label}
              </th>
              <td className="mono">
                {dimension.unit === "USD"
                  ? `$${agreement.terms[dimension.key].toLocaleString("en-US")}`
                  : dimension.min === 0 && dimension.max === 1
                    ? agreement.terms[dimension.key]
                      ? "yes"
                      : "no"
                    : `${agreement.terms[dimension.key]}${dimension.unit ? ` ${dimension.unit}` : ""}`}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Signature</th>
            <td className="mono small" style={{ wordBreak: "break-all" }}>
              {agreement.signature}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: "1rem", marginBottom: 0 }}>
        <Link className="button button-quiet" href={`/app/agreements/${agreement.agreementId}`}>
          Open the agreement
        </Link>
      </p>

      <p className="small mute" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
        Signing off on it, keeping a copy and checking the signature all live there. Or check it yourself:{" "}
        <code>GET /api/agreements/{agreement.agreementId}</code> returns the signed document, and{" "}
        <code>/api/health</code> publishes the key it was signed with.
      </p>
        </div>
      </div>
    </section>
  );
}
