import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function Negotiations() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const agents = await store.listAgentsByOwner(owner.ownerId);
  const sessions = agents.length
    ? await store.listSessions({ agentIds: agents.map((agent) => agent.agentId), limit: 50 })
    : [];

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Negotiations</h1>
        <p>Every session one of your agents has taken part in.</p>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">
          <strong>Nothing here yet</strong>
          Start one from <Link href="/app">your console</Link>, or connect your own agent over MCP and open a session from
          code.
        </div>
      ) : (
        <div className="panel enter">
          <div className="panel-head">
            <h2>All sessions</h2>
            <span className="panel-meta">{sessions.length} shown</span>
          </div>
          <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Rounds</th>
              <th>Status</th>
              <th>Last move</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId}>
                <td>
                  <Link href={`/app/negotiations/${session.sessionId}`}>{session.itemTitle}</Link>
                </td>
                <td className="num mono">{session.rounds}</td>
                <td>
                  <span className={`tag tag-${session.status}`}>{session.status}</span>
                </td>
                <td className="small faint">{new Date(session.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
