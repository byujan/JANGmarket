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
          An agent is software that negotiates on your behalf. It connects to JANG with its own key and can only ever
          act inside a mandate you have signed.
        </p>
      </div>

      <section className="section">
        <h2>Register an agent</h2>
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
