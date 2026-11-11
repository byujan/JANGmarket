import Link from "next/link";
import { redirect } from "next/navigation";
import { GettingStarted } from "@/components/GettingStarted.tsx";
import { LaunchNegotiation } from "@/components/LaunchNegotiation.tsx";
import { catalogue } from "@/lib/server/marketplace.ts";
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

  const items = await catalogue(owner.ownerId);
  const listings = await store.listItems({ ownerId: owner.ownerId, limit: 20 });
  const launchable = mandates

    .map((mandate) => {
      const item = items.find((candidate) => candidate.itemSpec.itemId === mandate.itemId);
      const agent = agents.find((candidate) => candidate.agentId === mandate.agentId);
      return item && agent
        ? { agentId: agent.agentId, agentLabel: agent.label, itemId: item.itemSpec.itemId, itemTitle: item.title }
        : undefined;
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option));

  return (
    <main className="page page-wide">
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
          <Link className="small mute" href="/app/mandates/new">
            Set your limits
          </Link>
        </div>
        <p className="hint" style={{ marginBottom: "1rem" }}>
          Your agent takes the buyer side and JANG&apos;s house agent takes the seller side. Both bargain under signed
          limits, and neither can see the other&apos;s. It runs on its own and takes about fifteen seconds.
        </p>
        <LaunchNegotiation options={launchable} />
      </section>

      <section className="section enter" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Your agents</h2>
            <Link className="panel-meta" href="/app/agents">
              Register an agent
            </Link>
          </div>
          {agents.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
            <strong>No agents yet</strong>
                An agent is the software that negotiates for you. <Link href="/app/agents">Register one</Link> to get
                a key.
              </div>
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
                  <td className="mute">{agent.label ?? "not set"}</td>
                  <td className="mono small">
                    {mandates.filter((mandate) => mandate.agentId === agent.agentId).length}
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Things you have listed</h2>
            <Link className="panel-meta" href="/app/items/new">
              List an item
            </Link>
          </div>
          {listings.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
                <strong>You have not listed anything</strong>
                The four markets that ship with JANG are ready to negotiate over. To bring your own, with terms of
                your choosing, <Link href="/app/items/new">list an item</Link>.
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Your side</th>
                  <th>Terms</th>
                  <th>Limits set</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((item) => {
                  const hasLimits = mandates.some((mandate) => mandate.itemId === item.itemId);
                  return (
                    <tr key={item.itemId}>
                      <td>{item.title}</td>
                      <td className={item.listedRole}>{item.listedRole === "seller" ? "selling" : "buying"}</td>
                      <td className="mono small">
                        {item.dimensions.map((dimension) => dimension.label).join(", ")}
                      </td>
                      <td>
                        {hasLimits ? (
                          <span className="tag tag-agreed">set</span>
                        ) : (
                          <Link className="small" href="/app/mandates/new">
                            set them
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Limits you have signed</h2>
          </div>
          {mandates.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
            <strong>You have not set any limits yet</strong>
                Until you do, your agent has no authority to act.{" "}
                <Link href="/app/mandates/new">Set your limits</Link>: your budget, what matters most, and when to
                walk away.
              </div>
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
        </div>
      </section>

      <section className="section enter" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Recent negotiations</h2>
            <Link className="panel-meta" href="/app/negotiations">
              See all
            </Link>
          </div>
          {sessions.length === 0 ? (
            <div className="panel-body">
              <p className="mute small" style={{ margin: 0 }}>
                None yet.
              </p>
            </div>
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
        </div>
      </section>
    </main>
  );
}
