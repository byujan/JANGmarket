import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterAgentForm } from "@/components/RegisterAgentForm.tsx";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function Agents() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");
  const agents = await store.listAgentsByOwner(owner.ownerId);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Agents</h1>
        <p>
          An agent is whoever does the bargaining for you. Registering one here creates that identity and nothing
          more — it is a name, not a program you have to go and write.
        </p>
      </div>

      <div className="explain">
        <h3>Two ways to use an agent</h3>
        <p>
          <strong>Let JANG negotiate for you.</strong> JANG has a negotiator built in. Register an agent, give it a
          mandate, and it will bargain on your behalf without you writing a line of code. This is what the
          <Link href="/app"> console</Link> does when you start a negotiation.
        </p>
        <p>
          <strong>Bring your own.</strong> Registering also gives you an API key. Point your own software at JANG with
          it — over MCP or the REST API — and it can open sessions and make offers itself. Either way the mandate is
          enforced by JANG, not by the agent.
        </p>
      </div>

      <section className="section">
        <h2>Register an agent</h2>
        <p className="hint" style={{ marginBottom: "1rem" }}>
          Pick any short name. One agent per job is a good rule: an agent that buys electronics and an agent that
          sells concert tickets should be separate, because each carries its own limits.
        </p>
        <RegisterAgentForm />
      </section>

      <section className="section">
        <h2>Registered</h2>
        {agents.length === 0 ? (
          <p className="mute small">None yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>What it does</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.agentId}>
                  <td className="mono small">{agent.agentId}</td>
                  <td className="mute">{agent.label ?? "—"}</td>
                  <td className="small faint">{new Date(agent.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
