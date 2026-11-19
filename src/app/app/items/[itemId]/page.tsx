import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { itemSpecOfListing } from "@/lib/server/marketplace.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";
import type { Dimension } from "@/lib/jang/types.ts";

export const dynamic = "force-dynamic";

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

function term(dimension: Dimension): string {
  const unit = dimension.unit ? ` ${dimension.unit}` : "";
  if (dimension.min === 0 && dimension.max === 1) return `${dimension.label}, yes or no`;
  if (dimension.unit === "USD") return `${dimension.label} ${money(dimension.min)}–${money(dimension.max)}`;
  return `${dimension.label} ${dimension.min}–${dimension.max}${unit}`;
}

/** One listing, the way its owner wrote it: photographs, prose and a price. */
export default async function Listing({ params }: { params: Promise<{ itemId: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const { itemId } = await params;
  const item = await store.getItem(itemId);
  if (!item) notFound();

  const [images, mandates] = await Promise.all([
    store.listItemImages([itemId]),
    store.listMandatesByOwner(owner.ownerId),
  ]);
  const spec = itemSpecOfListing(item);
  const mine = item.ownerId === owner.ownerId;
  const youHaveLimits = mandates.some((mandate) => mandate.itemId === itemId);
  const yourSide = mine ? item.listedRole : item.listedRole === "buyer" ? "seller" : "buyer";

  return (
    <main className="page page-wide">
      <p className="small mute" style={{ marginBottom: "0.75rem" }}>
        <Link href="/app/items">Market</Link> <span className="faint">/</span> {item.title}
      </p>

      <div className="page-head">
        <h1>{item.title}</h1>
        <p>
          {item.askingPrice !== undefined ? (
            <>
              Asking <strong className="mono">{money(item.askingPrice)}</strong>.{" "}
            </>
          ) : null}
          {mine ? (
            <>You listed this, {item.listedRole === "seller" ? "selling" : "buying"}.</>
          ) : (
            <>
              Listed by another owner, {item.listedRole === "seller" ? "selling" : "buying"}. You would be the{" "}
              {yourSide}.
            </>
          )}
        </p>
      </div>

      {images.length ? (
        <section className="section enter">
          <div className="photos photos-gallery">
            {images.map((image) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={image.position}
                className="photo-full"
                src={`/api/items/${itemId}/image/${image.position}`}
                alt={`${item.title}, photograph ${image.position + 1} of ${images.length}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section enter" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Description</h2>
            <span className="panel-meta">listed {new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="panel-body">
            {item.description ? (
              // The owner's own words, kept as written: line breaks are part of
              // how an advertisement reads.
              <p className="prose">{item.description}</p>
            ) : (
              <p className="mute small" style={{ margin: 0 }}>
                No description was written.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="section enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>What is negotiable</h2>
            <span className="panel-meta">{spec.dimensions.length} terms</span>
          </div>
          <div className="panel-body">
            <ul className="listing-terms">
              {spec.dimensions.map((dimension) => (
                <li key={dimension.key}>{term(dimension)}</li>
              ))}
            </ul>
            <p className="hint">
              These ranges are public, because a counterparty has to know what is on the table to make an offer. How
              far anyone will actually go is private, and signed separately.
            </p>
            {mine ? (
              youHaveLimits ? (
                <Link className="button" href="/app">
                  Start a negotiation
                </Link>
              ) : (
                <Link className="button" href="/app/mandates/new">
                  Set your limits for this
                </Link>
              )
            ) : (
              <p className="small faint" style={{ margin: 0 }}>
                Taking the other side of someone else&apos;s listing needs the lister themselves as counterparty, and
                that is not wired up yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
