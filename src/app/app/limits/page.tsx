import { walkAwayWords } from "@/lib/ui/words.ts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LimitDefaults } from "@/components/LimitDefaults.tsx";
import { isExpired } from "@/lib/jang/mandate.ts";
import { catalogue, roleFor } from "@/lib/server/marketplace.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * What limits this owner has set, item by item.
 *
 * The builder was the whole of this page, which meant the only way to find out
 * what you had already agreed to was to start setting it again. A limit is a
 * standing grant of authority; it deserves a list.
 */
export default async function Limits() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const [agents, mandates, entries] = await Promise.all([
    store.listAgentsByOwner(owner.ownerId),
    store.listMandatesByOwner(owner.ownerId),
    catalogue(owner.ownerId),
  ]);

  const now = new Date();
  const rows = entries.map((entry) => {
    const itemId = entry.itemSpec.itemId;
    const mandate = mandates.find((candidate) => candidate.itemId === itemId);
    return {
      itemId,
      title: entry.title,
      side: roleFor(entry, owner.ownerId) ?? ("buyer" as const),
      source: entry.source,
      mandate,
      expired: mandate ? isExpired(mandate, now) : false,
    };
  });

  const live = rows.filter((row) => row.mandate && !row.expired).length;
  const stale = rows.filter((row) => row.expired).length;

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Your limits</h1>
        <p>
          A limit says what your agent may agree to for one item: the most you would pay, the longest you would wait,
          and the point where you would rather walk away. It is private — the other side only ever sees the offers
          your agent makes.
        </p>
        <p className="small faint">
          Signed in your browser and lodged with JANG, a limit becomes a <em>mandate</em>: the authority your agent
          carries into a negotiation. JANG refuses anything beyond it, including offers from your own agent.
        </p>
      </div>

      <section className="section enter">
        <LimitDefaults initial={owner.defaults ?? {}} agents={agents} />
      </section>

      <section className="section enter" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Item by item</h2>
            <span className="panel-meta">
              {live} set{stale ? ` · ${stale} expired` : ""} · {rows.length} items
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="panel-body">
              <div className="empty">
                <strong>Nothing to set limits on yet</strong>
                The markets JANG ships with are always here; to bring your own,{" "}
                <Link href="/app/items/new">list an item</Link>.
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Your side</th>
                  <th>Will accept</th>
                  <th>Limits</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.itemId}>
                    <td>
                      {row.source === "listed" ? (
                        <Link href={`/app/items/${row.itemId}`}>{row.title}</Link>
                      ) : (
                        row.title
                      )}
                    </td>
                    <td className={row.side}>{row.side === "buyer" ? "buying" : "selling"}</td>
                    <td className="small">
                      {row.mandate ? walkAwayWords(row.mandate.reservationUtility) : <span className="faint">—</span>}
                    </td>
                    <td>
                      {!row.mandate ? (
                        <span className="tag">not set</span>
                      ) : row.expired ? (
                        <span className="tag tag-expired">expired</span>
                      ) : (
                        <span className="tag tag-agreed">
                          until {new Date(row.mandate.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link className="small" href={`/app/mandates/new?item=${encodeURIComponent(row.itemId)}`}>
                        {row.mandate ? "Replace" : "Set limits"}
                      </Link>
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
