import { redirect } from "next/navigation";
import { MandateBuilder } from "@/components/MandateBuilder.tsx";
import { catalog } from "@/lib/server/marketplace.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function NewMandate() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const agents = await store.listAgentsByOwner(owner.ownerId);
  const items = catalog().map((scenario) => ({ itemSpec: scenario.itemSpec, title: scenario.title }));

  return (
    <main className="page">
      <div className="page-head">
        <h1>Issue a mandate</h1>
        <p>
          A mandate is the authority your agent carries into a negotiation. JANG checks every offer against it and
          refuses anything beyond it, so your agent cannot commit you to a deal you did not authorise — and the
          counterparty never sees any of it.
        </p>
      </div>

      <MandateBuilder items={items} agents={agents} ownerId={owner.ownerId} />
    </main>
  );
}
