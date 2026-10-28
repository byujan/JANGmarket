"use client";

/**
 * The operator's view of the whole market.
 *
 * It shows refusals as prominently as agreements, because a refused offer is
 * the authority model doing its job and is the first thing worth checking when
 * something looks wrong.
 */
import { useEffect, useState } from "react";
import type { EventRecord, SessionSummary } from "@/lib/store/types.ts";

type Board = { sessions: SessionSummary[]; events: EventRecord[]; at: string };

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

  const open = board.sessions.filter((session) => session.status === "open");
  const agreed = board.sessions.filter((session) => session.status === "agreed");
  const refusals = board.events.filter((event) => event.kind === "refusal");

  return (
    <>
      <div className="row-between" style={{ marginBottom: "1.5rem" }}>
        <dl className="stats">
          <Stat label="Negotiating now" value={open.length} />
          <Stat label="Deals closed" value={agreed.length} />
          <Stat label="Refusals held" value={refusals.length} />
        </dl>
        <span className={`tag${live ? " tag-open tag-pulse" : ""}`}>{live ? "Live" : "Not connected"}</span>
      </div>

      <section className="section">
        <h2>Sessions</h2>
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
                    <a href={`/admin/sessions/${session.sessionId}`}>{session.itemTitle}</a>
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
        <h2>Refusals and events</h2>
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
