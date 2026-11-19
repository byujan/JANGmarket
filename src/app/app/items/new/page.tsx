import { redirect } from "next/navigation";
import { ListItemForm } from "@/components/ListItemForm.tsx";
import { currentOwner } from "@/lib/server/owner.ts";

export const dynamic = "force-dynamic";

export default async function NewItem() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  return (
    <main className="page page-wide sheet">
      <div className="page-head">
        <h1>List something to negotiate over</h1>
        <p>
          Photographs, a description and what you are asking. JANG opens the bargaining around that figure, and
          anything else you are open to goes in your own words at the bottom.
        </p>
      </div>

      <div className="explain">
        <h3>What other people see</h3>
        <p>
          <strong>Public:</strong> everything on this page — the photographs, the description, the asking price and
          whatever else you say you are open to. A counterparty cannot make you an offer without knowing what is on
          the table, and the agents read all of it before they start.
        </p>
        <p>
          <strong>Private:</strong> how far you would actually go. You sign that next, in your browser, and JANG
          enforces it without ever showing it to the other side.
        </p>
      </div>

      <ListItemForm />
    </main>
  );
}
