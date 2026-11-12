import Link from "next/link";
import { redirect } from "next/navigation";
import { catalogue, type CatalogueEntry } from "@/lib/server/marketplace.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";
import type { Dimension, Role } from "@/lib/jang/types.ts";

export const dynamic = "force-dynamic";

const opposite = (role: Role): Role => (role === "buyer" ? "seller" : "buyer");

/** A term, written the way the listing declared it. */
function term(dimension: Dimension): string {
  const unit = dimension.unit ? ` ${dimension.unit}` : "";
  if (dimension.min === 0 && dimension.max === 1) return `${dimension.label}, yes or no`;
  return `${dimension.label} ${dimension.min}–${dimension.max}${unit}`;
}

export default async function Market() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  // No owner id: this is the whole instance, not the slice the console offers
  // you. What you may negotiate over is a separate question, answered per card.
  const entries = await catalogue();
  const mandates = await store.listMandatesByOwner(owner.ownerId);
  const signed = new Set(mandates.map((mandate) => mandate.itemId));

  const built = entries.filter((entry) => entry.source === "built-in");
  const listed = entries.filter((entry) => entry.source === "listed");
  const yours = listed.filter((entry) => entry.listedBy === owner.ownerId);
  const others = listed.filter((entry) => entry.listedBy !== owner.ownerId);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Market</h1>
        <p>
          Everything on this instance that agents can negotiate over: the markets JANG ships with, and the items
          owners have listed themselves. Each one declares its terms and the range each may move within, and those
          ranges are what a mandate is written against.
        </p>
      </div>

      <Shelf
        title="Markets that ship with JANG"
        meta={`${built.length} items`}
        blurb="The house takes the side nobody has claimed, bargaining under its own signed mandate. You take the buyer side."
        entries={built.map((entry) => ({ entry, side: "buyer" as Role, open: true }))}
        signed={signed}
        index={0}
      />

      <Shelf
        title="Listed by you"
        meta={`${yours.length} items`}
        blurb="Items you brought, with terms of your own. You keep the side you listed and the house takes the other."
        empty={
          <>
            <strong>You have not listed anything</strong>
            To negotiate over something of your own, with terms you choose, <Link href="/app/items/new">list an item</Link>.
          </>
        }
        entries={yours.map((entry) => ({ entry, side: entry.listedRole!, open: true }))}
        signed={signed}
        index={1}
      />

      <Shelf
        title="Listed by other owners"
        meta={`${others.length} items`}
        blurb="Visible so you can see what the instance holds. Taking the other side of someone else's listing needs the lister themselves as counterparty, and that is not wired up yet, so these are not open to negotiate."
        empty={<strong>Nobody else has listed anything yet</strong>}
        entries={others.map((entry) => ({ entry, side: opposite(entry.listedRole!), open: false }))}
        signed={signed}
        index={2}
      />
    </main>
  );
}

type Shown = { entry: CatalogueEntry; side: Role; open: boolean };

function Shelf({
  title,
  meta,
  blurb,
  entries,
  signed,
  empty,
  index,
}: {
  title: string;
  meta: string;
  blurb: string;
  entries: Shown[];
  signed: Set<string>;
  empty?: React.ReactNode;
  index: number;
}) {
  return (
    <section className="section enter" style={{ "--i": index } as React.CSSProperties}>
      <div className="panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="panel-meta">{meta}</span>
        </div>
        <div className="panel-body">
          <p className="hint" style={{ marginTop: 0 }}>
            {blurb}
          </p>
          {entries.length === 0 ? (
            <div className="empty">{empty}</div>
          ) : (
            <div className="listings">
              {entries.map(({ entry, side, open }) => (
                <article className="listing" key={entry.itemSpec.itemId}>
                  <header>
                    <h3>{entry.title}</h3>
                    {/* Naming your side only makes sense if the side is
                        yours to take; otherwise say whose it is. */}
                    <span className={`tag ${open ? side : opposite(side)}`}>
                      {open
                        ? `you ${side === "buyer" ? "buy" : "sell"}`
                        : `owner ${side === "buyer" ? "sells" : "buys"}`}
                    </span>
                  </header>
                  {entry.description ? <p className="listing-blurb">{entry.description}</p> : null}
                  <ul className="listing-terms">
                    {entry.itemSpec.dimensions.map((dimension) => (
                      <li key={dimension.key}>{term(dimension)}</li>
                    ))}
                  </ul>
                  <footer>
                    {!open ? (
                      <span className="small faint">not open to you yet</span>
                    ) : signed.has(entry.itemSpec.itemId) ? (
                      <Link className="small" href="/app">
                        Limits signed · start a negotiation
                      </Link>
                    ) : (
                      <Link className="small" href="/app/mandates/new">
                        Set your limits for this
                      </Link>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
