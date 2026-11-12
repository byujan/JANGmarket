import Link from "next/link";
import { redirect } from "next/navigation";
import { OUTCOME_COPY } from "@/lib/jang/settlement.ts";
import { agreementsForOwner } from "@/lib/server/settlement.ts";
import { currentOwner } from "@/lib/server/owner.ts";

export const dynamic = "force-dynamic";

const OUTCOME_TAG = { open: "tag-open", settled: "tag-agreed", "fell-through": "tag-failed" } as const;

export default async function Agreements() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");
  const rows = await agreementsForOwner(owner.ownerId);

  const counted = {
    open: rows.filter((row) => row.settlement.outcome === "open").length,
    settled: rows.filter((row) => row.settlement.outcome === "settled").length,
  };

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Agreements</h1>
        <p>
          Every deal your agents closed. Each one is a document JANG signed, saying these two agents committed to
          these terms under mandates it had checked. What happened next is between the two owners, and this is where
          they say so.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>No agreements yet</strong>
          When a negotiation closes, the signed agreement lands here. Start one from{" "}
          <Link href="/app">your console</Link>.
        </div>
      ) : (
        <section className="section enter">
          <div className="panel">
            <div className="panel-head">
              <h2>Closed deals</h2>
              <span className="panel-meta">
                {counted.settled} settled · {counted.open} awaiting confirmation
              </span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Your side</th>
                  <th>Counterparty</th>
                  <th>Agreed</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.agreement.agreementId}>
                    <td>
                      <Link href={`/app/agreements/${row.agreement.agreementId}`}>{row.itemTitle}</Link>
                    </td>
                    <td className={row.yourRole}>{row.yourRole === "buyer" ? "bought" : "sold"}</td>
                    <td className="mono small">
                      {row.counterpartyIsHouse ? "JANG house agent" : row.counterpartyAgentId}
                    </td>
                    <td className="small faint">{new Date(row.agreement.agreedAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`tag ${OUTCOME_TAG[row.settlement.outcome]}`}>
                        {OUTCOME_COPY[row.settlement.outcome].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
