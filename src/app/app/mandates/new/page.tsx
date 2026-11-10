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
        <h1>Your limits</h1>
        <p>
          This is where you say what you are actually willing to accept: your budget, how long you will wait, what
          matters most, and the point where you would rather walk away. It is private. The other side never sees any
          of it. They only ever see the offers your agent makes.
        </p>
        <p className="small faint">
          Signed and lodged, this becomes a <em>mandate</em>: the authority your agent carries into a negotiation.
          JANG checks every offer against it and refuses anything beyond it, including offers from your own agent.
        </p>
      </div>

      <div className="explain">
        <h3>What you are deciding</h3>
        <p>
          <strong>A limit for each term.</strong> The most you would pay, the longest you would wait. Your agent may
          move anywhere inside the lit band and nowhere outside it.
        </p>
        <p>
          <strong>How much each term matters.</strong> A few choices between two packages, then what each term is worth
          to you in money. This is what lets your agent trade: if price matters far more than delivery, it will give up
          delivery date to win on price, which is how a negotiation finds a deal that a fixed price cannot.
        </p>
        <p>
          <strong>When to walk away.</strong> What you would do instead if this falls through. A package can sit
          inside every limit and still be worse than the deal you could get elsewhere; your agent will not take it.
        </p>
        <p className="small faint">
          Signing happens in your browser. The key that signs it is generated here and never sent to JANG, so JANG can
          check your mandate but cannot write one for you.
        </p>
      </div>

      <MandateBuilder items={items} agents={agents} ownerId={owner.ownerId} />
    </main>
  );
}
