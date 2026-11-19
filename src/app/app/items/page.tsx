import Link from "next/link";
import { redirect } from "next/navigation";
import { catalogue, type CatalogueEntry } from "@/lib/server/marketplace.ts";
import { isExpired } from "@/lib/jang/mandate.ts";
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
  // Positions only, never the bytes: a cover is an <img> tag, not megabytes
  // pulled through the page.
  const covers = new Set(
    (await store.listItemImages(entries.map((entry) => entry.itemSpec.itemId)))
      .filter((image) => image.position === 0)
      .map((image) => image.itemId),
  );
  // Expiry counts. A card saying limits are signed when the mandate ran out
  // sends you to a launch that fails, and the limits page already calls the
  // same mandate expired.
  const now = new Date();
  const signed = new Set(
    mandates.filter((mandate) => !isExpired(mandate, now)).map((mandate) => mandate.itemId),
  );
  const stale = new Set(
    mandates.filter((mandate) => isExpired(mandate, now)).map((mandate) => mandate.itemId),
  );

  const built = entries.filter((entry) => entry.source === "built-in");
  const listed = entries.filter((entry) => entry.source === "listed");
  const yours = listed.filter((entry) => entry.listedBy === owner.ownerId);
  const others = listed.filter((entry) => entry.listedBy !== owner.ownerId);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Market</h1>
        <p>
          Everything on this instance that agents can negotiate over. Each one declares its terms and the range each
          may move within, and those ranges are what a mandate is written against.
        </p>
        <p className="small faint">
          The examples below are not the same kind of thing as a listing. Each ships with two hand-written positions
          whose weights disagree — a warranty that costs the seller little and is worth a lot to the buyer — so there
          is a trade in them to find. A listing carries only your side, and JANG derives the other from the ranges you
          declared.
        </p>
      </div>

      <Shelf
        title="Example markets"
        meta={`${built.length} items`}
        blurb="Worked examples, each with a counterparty written by hand. The house takes the side nobody has claimed and bargains under its own signed mandate; you take the buyer side."
        entries={built.map((entry) => ({ entry, side: "buyer" as Role, open: true }))}
        stale={stale}
        covers={covers}
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
        stale={stale}
        covers={covers}
        signed={signed}
        index={1}
      />

      <Shelf
        title="Listed by other owners"
        meta={`${others.length} items`}
        blurb="Visible so you can see what the instance holds. Taking the other side of someone else's listing needs the lister themselves as counterparty, and that is not wired up yet, so these are not open to negotiate."
        empty={<strong>Nobody else has listed anything yet</strong>}
        entries={others.map((entry) => ({ entry, side: opposite(entry.listedRole!), open: false }))}
        stale={stale}
        covers={covers}
        signed={signed}
        index={2}
      />
    </main>
  );
}

type Shown = { entry: CatalogueEntry; side: Role; open: boolean };

/** A card holds a glance, not an essay; the listing itself holds the rest. */
function blurbOf(description: string): string {
  const limit = 170;
  if (description.length <= limit) return description;
  const cut = description.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 100 ? lastSpace : limit).trimEnd()}…`;
}

function Shelf({
  title,
  meta,
  blurb,
  entries,
  signed,
  stale,
  covers,
  empty,
  index,
}: {
  title: string;
  meta: string;
  blurb: string;
  entries: Shown[];
  signed: Set<string>;
  stale: Set<string>;
  covers: Set<string>;
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
                  {/* Every card gets the same slot whether or not it has a
                      photograph, so a row of them does not come out ragged. */}
                  {entry.source === "listed" ? (
                    covers.has(entry.itemSpec.itemId) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        className="listing-cover"
                        src={`/api/items/${entry.itemSpec.itemId}/image/0`}
                        alt={`${entry.title}, as listed`}
                      />
                    ) : (
                      <div className="listing-cover listing-cover-empty" aria-hidden>
                        no photograph
                      </div>
                    )
                  ) : null}
                  <header>
                    <h3>
                      {entry.source === "listed" ? (
                        <Link href={`/app/items/${entry.itemSpec.itemId}`}>{entry.title}</Link>
                      ) : (
                        entry.title
                      )}
                    </h3>
                    {/* Naming your side only makes sense if the side is
                        yours to take; otherwise say whose it is. */}
                    <span className={`tag ${open ? side : opposite(side)}`}>
                      {open
                        ? `you ${side === "buyer" ? "buy" : "sell"}`
                        : `owner ${side === "buyer" ? "sells" : "buys"}`}
                    </span>
                  </header>
                  {entry.description ? <p className="listing-blurb">{blurbOf(entry.description)}</p> : null}
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
                    ) : stale.has(entry.itemSpec.itemId) ? (
                      <Link className="small" href={`/app/mandates/new?item=${entry.itemSpec.itemId}`}>
                        Your limits expired · set them again
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
