"use client";

import Link from "next/link";
/**
 * The operator's view of the whole market.
 *
 * It shows refusals as prominently as agreements, because a refused offer is
 * the authority model doing its job and is the first thing worth checking when
 * something looks wrong.
 */
import { useEffect, useState } from "react";
import type { EventRecord, SessionCounts, SessionSummary } from "@/lib/store/types.ts";

/**
 * `sessions` and `events` are one page of rows for the tables below.
 * `counts` and `refusals` are totals over everything stored: the tiles read
 * those, because counting the page would silently under-report.
 */
type Board = {
  sessions: SessionSummary[];
  events: EventRecord[];
  counts: SessionCounts;
  refusals: number;
  at: string;
};

export function OperationsBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/admin/stream");
    source.onopen = () => setLive(true);
    source.addEventListener("update", (event) => setBoard(JSON.parse((event as MessageEvent).data) as Board));
    source.onerror = () => {
      setLive(false);
      source.close();
    };
    return () => source.close();
  }, []);


  return (
    <>
      <div className="row-between" style={{ marginBottom: "1.5rem" }}>
        <dl className="stats" title="Across every agent on this instance, not only your own">
          <Stat label="Negotiating now" value={board.counts.open} />
          <Stat label="Deals closed" value={board.counts.agreed} />
          <Stat label="Refusals held" value={board.refusals} />
        </dl>
        <span className={`tag${live ? " tag-open tag-pulse" : ""}`}>{live ? "Live" : "Not connected"}</span>
      </div>

      <section className="section">
        <div className="row-between">
          <h2>Sessions</h2>
          <span className="small faint">
            {board.sessions.length} most recent of {board.counts.total}
          </span>
        </div>
        {board.sessions.length === 0 ? (
          <div className="empty">
            <strong>Nothing has been negotiated yet</strong>
            Sessions appear here the moment an agent opens one, whether it came from this site or straight from MCP.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th className="num">Rounds</th>
                <th>Status</th>
                <th>Last move</th>
              </tr>
            </thead>
            <tbody>
              {board.sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <Link href={`/admin/sessions/${session.sessionId}`}>{session.itemTitle}</Link>
                  </td>
                  <td className="mono small buyer">{session.buyerAgentId}</td>
                  <td className="mono small seller">{session.sellerAgentId}</td>
                  <td className="num mono">{session.rounds}</td>
                  <td>
                    <span className={`tag tag-${session.status}`}>{session.status}</span>
                  </td>
                  <td className="small faint mono">{new Date(session.updatedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <div className="row-between">
          <h2>Refusals and events</h2>
          <span className="small faint">{board.events.length} most recent</span>
        </div>
        {board.events.length === 0 ? (
          <p className="mute small">Nothing recorded yet.</p>
        ) : (
          <ul className="feed">
            {board.events.map((event, index) => (
              <li key={event.id ?? index} className={`feed-item${event.kind === "refusal" ? " feed-deny" : ""}`}>
                <span className="mono small faint">{new Date(event.createdAt).toLocaleTimeString()}</span>
                <span className="feed-body">
                  <span className="mono small">{event.code ?? event.kind}</span>{" "}
                  <span className="mute small">{event.message ?? describe(event)}</span>
                  {event.agentId ? <span className="small faint"> · {event.agentId}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function describe(event: EventRecord): string {
  if (event.kind === "offer") {
    const detail = event.detail as { round?: number } | undefined;
    return `offer in round ${detail?.round ?? "?"}`;
  }
  if (event.kind === "session_opened") return "session opened";
  if (event.kind === "agreed") return "agreement signed";
  return event.kind;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <dt className="small mute">{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}
