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
          Describe what it is and which terms are on the table. Anything can be a term, not only price: a delivery
          date, a warranty, a notice period, how many revisions are included.
        </p>
      </div>

      <div className="explain">
        <h3>What other people see</h3>
        <p>
          <strong>Public:</strong> the terms and how far each may move. A counterparty cannot make you an offer
          without knowing what is on the table.
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
