import Link from "next/link";
import { redirect } from "next/navigation";
import { GettingStarted } from "@/components/GettingStarted.tsx";
import { LaunchNegotiation } from "@/components/LaunchNegotiation.tsx";
import { catalog } from "@/lib/server/marketplace.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function Console() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const [agents, mandates] = await Promise.all([
    store.listAgentsByOwner(owner.ownerId),
    store.listMandatesByOwner(owner.ownerId),
  ]);
  const sessions = agents.length
    ? await store.listSessions({ agentIds: agents.map((agent) => agent.agentId), limit: 8 })
    : [];

  const items = catalog();
  const launchable = mandates
    .filter((mandate) => mandate.role === "buyer")
    .map((mandate) => {
      const item = items.find((candidate) => candidate.itemSpec.itemId === mandate.itemId);
      const agent = agents.find((candidate) => candidate.agentId === mandate.agentId);
      return item && agent
        ? { agentId: agent.agentId, agentLabel: agent.label, itemId: item.itemSpec.itemId, itemTitle: item.title }
        : undefined;
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option));

  return (
    <main className="page">
      <div className="page-head">
        <h1>{owner.displayName ? `Hello, ${owner.displayName}` : "Your console"}</h1>
        <p>
          You delegate authority here. Register an agent, sign a mandate that says how far it may go, and watch it
          bargain inside those limits.
        </p>
      </div>

      <GettingStarted
        progress={{ agents: agents.length, mandates: mandates.length, negotiations: sessions.length }}
      />

      <section className="section">
        <div className="row-between">
          <h2>Start a negotiation</h2>
          <a className="small mute" href="/app/mandates/new">
            Issue a mandate
          </a>
        </div>
        <LaunchNegotiation options={launchable} />
      </section>

      <section className="section">
        <div className="row-between">
          <h2>Your agents</h2>
          <a className="small mute" href="/app/agents">
            Register an agent
          </a>
        </div>
        {agents.length === 0 ? (
          <div className="empty">
            <strong>No agents yet</strong>
            An agent is the software that negotiates for you. <Link href="/app/agents">Register one</Link> to get a key.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>What it does</th>
                <th>Mandates</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.agentId}>
                  <td className="mono small">{agent.agentId}</td>
                  <td className="mute">{agent.label ?? "—"}</td>
                  <td className="mono small">
                    {mandates.filter((mandate) => mandate.agentId === agent.agentId).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>Mandates you have signed</h2>
        {mandates.length === 0 ? (
          <div className="empty">
            <strong>No mandates yet</strong>
            A mandate is the authority an agent acts under: the lines it may not cross and the point below which it
            should walk away. <Link href="/app/mandates/new">Sign one</Link>.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Side</th>
                <th>Agent</th>
                <th>Walk away below</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {mandates.map((mandate) => (
                <tr key={mandate.mandateId}>
                  <td>{items.find((item) => item.itemSpec.itemId === mandate.itemId)?.title ?? mandate.itemId}</td>
                  <td className={mandate.role}>{mandate.role}</td>
                  <td className="mono small">{mandate.agentId}</td>
                  <td className="mono small">{mandate.reservationUtility}</td>
                  <td className="small faint">{new Date(mandate.expiresAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <div className="row-between">
          <h2>Recent negotiations</h2>
          <a className="small mute" href="/app/negotiations">
            See all
          </a>
        </div>
        {sessions.length === 0 ? (
          <p className="mute small">None yet.</p>
        ) : (
          <table className="table">
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <Link href={`/app/negotiations/${session.sessionId}`}>{session.itemTitle}</Link>
                  </td>
                  <td className="num mono small">{session.rounds} rounds</td>
                  <td>
                    <span className={`tag tag-${session.status}`}>{session.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
