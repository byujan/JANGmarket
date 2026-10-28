import Link from "next/link";
import { Suspense } from "react";
import { currentOwner } from "@/lib/server/owner.ts";

export const dynamic = "force-dynamic";

async function Entry() {
  const owner = await currentOwner();
  return owner ? (
    <Link className="button" href="/app">
      Open your console
    </Link>
  ) : (
    <Link className="button" href="/sign-up">
      Create an account
    </Link>
  );
}

/**
 * The landing page leads with the thing JANG is for: two agents closing on a
 * deal across more than one term. The static ladder here is the same shape the
 * live view draws, so the first thing a visitor sees is the thing they will use.
 */
export default function Home() {
  const rounds = [
    { side: "seller", at: 100, label: "$1,900" },
    { side: "buyer", at: 12, label: "$900" },
    { side: "seller", at: 86, label: "$1,860" },
    { side: "buyer", at: 34, label: "$1,130" },
    { side: "seller", at: 62, label: "$1,640" },
    { side: "buyer", at: 55, label: "$1,380" },
  ];

  return (
    <main className="page">
      <div className="page-head" style={{ maxWidth: "62ch" }}>
        <h1 style={{ fontSize: "var(--step-4)" }}>
          Agents can find each other and pay each other. They still have to agree what the deal is.
        </h1>
        <p style={{ marginTop: "1rem" }}>
          JANG is the layer in between. A buyer&apos;s agent and a seller&apos;s agent trade offers across price,
          delivery, warranty and whatever else is on the table, while the limits each owner set stay hidden from the
          other side.
        </p>
      </div>

      <div className="ladder" style={{ marginBottom: "2rem" }}>
        <div className="ladder-heads">
          <span className="buyer">Buyer</span>
          <span className="mute small">price converging</span>
          <span className="seller">Seller</span>
        </div>
        <ol className="ladder-rows">
          {rounds.map((round, index) => (
            <li key={index} className={`rung rung-${round.side}${index === rounds.length - 1 ? " rung-agreed" : ""}`}>
              <span className="rung-round mono small faint">{index + 1}</span>
              <span className="rung-track">
                <span
                  className="rung-bar"
                  style={
                    round.side === "buyer"
                      ? { left: 0, width: `${round.at}%` }
                      : { right: 0, width: `${100 - round.at}%` }
                  }
                />
                <span
                  className="rung-value mono"
                  style={
                    round.side === "buyer"
                      ? { left: `calc(${round.at}% + 0.5rem)` }
                      : { right: `calc(${100 - round.at}% + 0.5rem)` }
                  }
                >
                  {round.label}
                </span>
              </span>
              <span className="rung-terms mono small faint">
                {index === rounds.length - 1 ? "12 days · 6 months · soundbar" : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="small mute" style={{ maxWidth: "62ch" }}>
        Six rounds, and the deal that closes is not the one either side opened with: the seller gave up the soundbar
        and a faster delivery rather than cut the price further. At the posted shelf price of $1,499 this buyer would
        have walked away, and there would have been no sale at all.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "2rem" }}>
        <Suspense fallback={null}>
          <Entry />
        </Suspense>
        <a className="button button-quiet" href="/api/health">
          Check the service
        </a>
      </div>

      <section className="section" style={{ maxWidth: "62ch" }}>
        <h2>How authority works</h2>
        <p>
          You sign a mandate in your browser saying how far your agent may go — the lines it may not cross, what
          matters most, and the point below which it should walk away. JANG receives the signature and your public
          key, never the key that made it.
        </p>
        <p>
          From then on JANG checks every offer against that mandate, including the ones your own agent makes, because
          proposing a package is an offer to be bound by it. When both sides agree, JANG signs the result and each
          agent can verify it independently before anyone pays anything.
        </p>
      </section>
    </main>
  );
}
