import { notFound, redirect } from "next/navigation";
import { ConvergenceLadder } from "@/components/ConvergenceLadder.tsx";
import { utility } from "@/lib/jang/utility.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * The operator's view of a single negotiation, showing both mandates.
 *
 * This is limitation #1 made visible rather than hidden: JANG holds both sides'
 * private limits in order to enforce them, so an operator can read them. Saying
 * so plainly is better than implying a guarantee the system does not make.
 */
export default async function AdminSession({ params }: { params: Promise<{ sessionId: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");
  if (!owner.isAdmin) notFound();

  const { sessionId } = await params;
  const session = await store.getSession(sessionId);
  if (!session) notFound();

  const agreement = session.agreementId ? await store.getAgreement(session.agreementId) : undefined;
  const events = await store.listEvents({ sessionId, limit: 50 });
  const buyer = session.mandates[session.participants.buyer];
  const seller = session.mandates[session.participants.seller];

  return (
    <main className="page">
      <p className="small mute" style={{ marginBottom: "0.75rem" }}>
        <a href="/admin">Operations</a> <span className="faint">/</span>{" "}
        <span className="mono">{session.sessionId}</span>
      </p>

      <div className="row-between" style={{ marginBottom: "1rem" }}>
        <h1>{session.itemSpec.title}</h1>
        <span className={`tag tag-${session.status}`}>{session.status}</span>
      </div>

      <ConvergenceLadder
        dimensions={session.itemSpec.dimensions}
        offers={session.offers}
        buyerAgentId={session.participants.buyer}
        agreedOfferId={agreement?.offerId}
      />

      <section className="section">
        <h2>Both mandates</h2>
        <p className="small mute">
          Neither agent can see the other&apos;s column. JANG can, because it validates offers against them — which is
          exactly the trust assumption this prototype has not yet removed.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Term</th>
              <th className="buyer">Buyer may</th>
              <th className="seller">Seller may</th>
              {agreement ? <th>Agreed</th> : null}
            </tr>
          </thead>
          <tbody>
            {session.itemSpec.dimensions.map((dimension) => (
              <tr key={dimension.key}>
                <th scope="row">{dimension.label}</th>
                <td className="mono small">{describeBound(buyer.constraints[dimension.key])}</td>
                <td className="mono small">{describeBound(seller.constraints[dimension.key])}</td>
                {agreement ? <td className="mono small">{agreement.terms[dimension.key]}</td> : null}
              </tr>
            ))}
            <tr>
              <th scope="row">Walk away below</th>
              <td className="mono small">{buyer.reservationUtility}</td>
              <td className="mono small">{seller.reservationUtility}</td>
              {agreement ? <td /> : null}
            </tr>
            {agreement ? (
              <tr>
                <th scope="row">Value at agreement</th>
                <td className="mono small">{utility(agreement.terms, buyer).toFixed(3)}</td>
                <td className="mono small">{utility(agreement.terms, seller).toFixed(3)}</td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2>What happened</h2>
        <ul className="feed">
          {events.map((event, index) => (
            <li key={event.id ?? index} className={`feed-item${event.kind === "refusal" ? " feed-deny" : ""}`}>
              <span className="mono small faint">{new Date(event.createdAt).toLocaleTimeString()}</span>
              <span className="feed-body">
                <span className="mono small">{event.code ?? event.kind}</span>{" "}
                <span className="mute small">{event.message ?? ""}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function describeBound(bound?: { min?: number; max?: number }): string {
  if (!bound) return "no limit";
  if (bound.min !== undefined && bound.max !== undefined) return `${bound.min} – ${bound.max}`;
  if (bound.min !== undefined) return `≥ ${bound.min}`;
  if (bound.max !== undefined) return `≤ ${bound.max}`;
  return "no limit";
}
