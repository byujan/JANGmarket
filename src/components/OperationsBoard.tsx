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
  /** Items people listed themselves, as opposed to the markets that ship. */
  listed: number;
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
      <div className="row-between" style={{ marginBottom: "0.9rem" }}>
        <p className="small faint" style={{ margin: 0 }}>
          Across every agent on this instance, not only your own.
        </p>
        <span className={`tag${live ? " tag-open tag-pulse" : ""}`}>{live ? "Live" : "Not connected"}</span>
      </div>

      <dl className="cards">
        <Stat
          label="Negotiating now"
          value={board.counts.open}
          foot={board.counts.open > 0 ? "updating as agents move" : "nothing in flight"}
          live={board.counts.open > 0}
          index={0}
        />
        <Stat
          label="Deals closed"
          value={board.counts.agreed}
          foot={`${board.counts.total} sessions all told`}
          index={1}
        />
        <Stat
          label="Refusals held"
          value={board.refusals}
          foot="offers blocked by a mandate"
          index={2}
        />
        <Stat
          label="Items listed"
          value={board.listed}
          foot="brought by owners, beyond the markets that ship"
          index={3}
        />
      </dl>

      <section className="section enter" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Sessions</h2>
            <span className="panel-meta">
              {board.sessions.length} most recent of {board.counts.total}
            </span>
          </div>
          {board.sessions.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
                <strong>Nothing has been negotiated yet</strong>
                Sessions appear here the moment an agent opens one, whether it came from this site or straight from
                MCP.
              </div>
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
        </div>
      </section>

      <section className="section enter" style={{ "--i": 4 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Refusals and events</h2>
            <span className="panel-meta">{board.events.length} most recent</span>
          </div>
          <div className="panel-body">
            {board.events.length === 0 ? (
              <p className="mute small" style={{ margin: 0 }}>
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="feed">
            {board.events.map((event, index) => (
              <li
                key={event.id ?? index}
                className={`feed-item${event.kind === "refusal" || event.code === "NO_POSSIBLE_DEAL" ? " feed-deny" : ""}`}
              >
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
          </div>
        </div>
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
  // NO_POSSIBLE_DEAL sessions carry their own message; agents are never told.
  if (event.kind === "agreed") return "agreement signed";
  return event.kind;
}

function Stat({
  label,
  value,
  foot,
  live,
  index,
}: {
  label: string;
  value: number;
  foot: string;
  live?: boolean;
  index: number;
}) {
  return (
    <div className={`card enter${live ? " card-live" : ""}`} style={{ "--i": index } as React.CSSProperties}>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
      <span className="card-foot">{foot}</span>
    </div>
  );
}
