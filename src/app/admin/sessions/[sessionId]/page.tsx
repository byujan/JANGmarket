import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConvergenceLadder } from "@/components/ConvergenceLadder.tsx";
import { ConcessionChart } from "@/components/ConcessionChart.tsx";
import { FrontierChart } from "@/components/FrontierChart.tsx";
import {
  anchoring,
  classifyIssues,
  compromiseBenchmark,
  concessionSeries,
  loseLose,
  pace,
  reversals,
} from "@/lib/jang/analysis.ts";
import { verifyAgreementSignature } from "@/lib/jang/agreement.ts";
import { jang } from "@/lib/server/service.ts";
import { bestImprovement, quality, sessionFrontier } from "@/lib/jang/frontier.ts";
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
  const truth = sessionFrontier(session);
  const issues = classifyIssues(session.itemSpec, buyer, seller);
  const loseLoseTerms = agreement ? loseLose(agreement.terms, issues) : [];
  const benchmark = agreement
    ? compromiseBenchmark(session.itemSpec, buyer, seller, truth, agreement.terms)
    : undefined;
  const dealQuality = agreement ? quality(agreement.terms, buyer, seller, truth) : undefined;
  const anchors = anchoring(session.itemSpec, session.offers, session.participants.buyer, agreement?.terms);
  const pulledBack = reversals(session.itemSpec, session.offers, session.mandates, session.participants);
  const tempo = pace(session.offers, session.maxRounds);
  const sellerMarket = await jang.marketFor(session.participants.seller, session.itemSpec.itemId);
  const mesoOffers = session.offers.filter((offer) => (offer.alternatives?.length ?? 0) > 0);
  // Re-checked rather than trusted: a keyless instance mints a new signing key
  // on restart, and an agreement signed before that will not verify after it.
  const signatureHolds = agreement ? verifyAgreementSignature(agreement, jang.publicKey) : undefined;
  const disclosedBy = [buyer.disclosePriorities ? "buyer" : null, seller.disclosePriorities ? "seller" : null]
    .filter(Boolean)
    .join(" and ");
  const span = (seconds: number) => (seconds >= 90 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`);
  const missed = agreement ? bestImprovement(agreement.terms, buyer, seller, truth) : undefined;

  return (
    <main className="page page-wide">
      <p className="small mute" style={{ marginBottom: "0.75rem" }}>
        <Link href="/admin">Operations</Link> <span className="faint">/</span>{" "}
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
        <h2>What a deal could have been</h2>
        <FrontierChart
          truth={truth}
          buyer={buyer}
          seller={seller}
          offers={session.offers}
          agreedTerms={agreement?.terms}
          quality={dealQuality}
          missed={missed}
          dimensions={session.itemSpec.dimensions}
        />
      </section>

      <section className="section enter">
        <div className="panel">
          <div className="panel-head">
            <h2>Where it started and where it landed</h2>
            <span className="panel-meta">opening positions, and the ground between them</span>
          </div>
          <div className="panel-body">
            <dl className="cards" style={{ margin: 0 }}>
              <div className="card">
                <dt>Seller opened at</dt>
                <dd className="mono seller">
                  {anchors.sellerOpen === undefined ? "none" : formatTerm(anchors.axis, anchors.sellerOpen)}
                </dd>
                <span className="card-foot">first {anchors.axis.label.toLowerCase()} named</span>
              </div>
              <div className="card">
                <dt>Buyer opened at</dt>
                <dd className="mono buyer">
                  {anchors.buyerOpen === undefined ? "none" : formatTerm(anchors.axis, anchors.buyerOpen)}
                </dd>
                <span className="card-foot">first {anchors.axis.label.toLowerCase()} named</span>
              </div>
              <div className="card">
                <dt>Settled</dt>
                <dd className="mono">
                  {anchors.settled === undefined ? "none" : formatTerm(anchors.axis, anchors.settled)}
                </dd>
                <span className="card-foot">
                  {anchors.towardBuyer === undefined
                    ? "no agreement"
                    : `${(anchors.towardBuyer * 100).toFixed(0)}% of the way to the buyer's opening`}
                </span>
              </div>
              <div className={`card${sellerMarket.remaining <= 0 ? " card-live" : ""}`}>
                <dt>Seller still has</dt>
                <dd className="mono">
                  {sellerMarket.remaining}/{sellerMarket.authorised}
                </dd>
                <span className="card-foot">
                  {sellerMarket.openSessions > 1
                    ? `${sellerMarket.openSessions} negotiations running for it`
                    : "no other negotiation for it"}
                </span>
              </div>
              <div className="card">
                <dt>Rounds used</dt>
                <dd className="mono">
                  {session.offers.length}/{session.maxRounds}
                </dd>
                <span className="card-foot">
                  {tempo.roundPressure >= 0.9 ? "went to the wire" : `over ${span(tempo.totalSeconds)}`}
                </span>
              </div>
            </dl>

            {pulledBack.length > 0 ? (
              <div className="notice notice-warn" style={{ marginTop: "1rem" }}>
                {pulledBack.length === 1 ? "One offer" : `${pulledBack.length} offers`} pulled a term back after
                conceding it:{" "}
                {pulledBack
                  .map((r) => `round ${r.round} (${r.pulledBack.map((t) => t.label.toLowerCase()).join(", ")})`)
                  .join("; ")}
                . A reversal late in a negotiation is worth a look.
              </div>
            ) : null}

            <p className="small faint" style={{ marginTop: "0.9rem", marginBottom: 0 }}>
              {mesoOffers.length > 0
                ? `${mesoOffers.length} ${mesoOffers.length === 1 ? "turn" : "turns"} put several equally good packages on the table at once. `
                : "Neither side offered alternatives; every turn carried one package. "}
              {disclosedBy ? `Priority order was disclosed by the ${disclosedBy}. ` : "Neither owner disclosed their priority order. "}
              {signatureHolds === undefined
                ? ""
                : signatureHolds
                  ? "The agreement still verifies against the current signing key."
                  : "The agreement does NOT verify against the current signing key: it was signed before a restart."}
            </p>
          </div>
        </div>
      </section>

      <section className="section enter">
        <div className="panel">
          <div className="panel-head">
            <h2>How each side moved</h2>
            <span className="panel-meta">declining steps signal closeness to a walk-away</span>
          </div>
          <div className="panel-body">
            <ConcessionChart
              buyer={concessionSeries(session.offers, session.participants.buyer, buyer)}
              seller={concessionSeries(session.offers, session.participants.seller, seller)}
              buyerReservation={buyer.reservationUtility}
              sellerReservation={seller.reservationUtility}
              maxRounds={session.maxRounds}
            />
          </div>
        </div>
      </section>

      <section className="section enter">
        <div className="panel">
          <div className="panel-head">
            <h2>What kind of terms these were</h2>
            <span className="panel-meta">
              {issues.filter((i) => i.kind === "integrative").length} offered a trade
            </span>
          </div>
          <div className="panel-body">
            <p className="hint" style={{ marginTop: 0 }}>
              A term both sides want the same end of is compatible, and settling it anywhere else loses value for
              nobody&apos;s benefit. A term they pull against but weigh very differently is where a trade lives.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Kind</th>
                  <th className="num">Buyer&apos;s attention</th>
                  <th className="num">Seller&apos;s attention</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.key}>
                    <th scope="row">{issue.label}</th>
                    <td>
                      <span className={`issue-kind issue-${issue.kind}`}>{issue.kind}</span>
                    </td>
                    <td className="num mono small">{(issue.buyerWeight * 100).toFixed(0)}%</td>
                    <td className="num mono small">{(issue.sellerWeight * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loseLoseTerms.length > 0 ? (
              <div className="notice notice-warn" style={{ marginTop: "1rem" }}>
                Lose-lose: {loseLoseTerms.map((i) => i.label.toLowerCase()).join(", ")} settled away from what both
                owners
                wanted. Nobody gained by it.
              </div>
            ) : null}
            {benchmark ? (
              <p className="small mute" style={{ marginTop: "1rem", marginBottom: 0 }}>
                Splitting every term down the middle{" "}
                {benchmark.compromiseAllowed
                  ? `would have reached ${(benchmark.compromise * 100).toFixed(0)}% of the value available, against ${(benchmark.achieved * 100).toFixed(0)}% for the deal they actually struck.`
                  : "would not have been allowed by both mandates at all, so the compromise everyone reaches for was never a deal here."}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Both mandates</h2>
        <p className="small mute">
          Neither agent can see the other&apos;s column. JANG can, because it validates offers against them, which is
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

function formatTerm(dimension: { unit?: string; min: number; max: number }, value: number): string {
  if (dimension.unit === "USD") return `$${value.toLocaleString("en-US")}`;
  if (dimension.min === 0 && dimension.max === 1) return value ? "yes" : "no";
  return `${value}${dimension.unit ? ` ${dimension.unit}` : ""}`;
}

function describeBound(bound?: { min?: number; max?: number }): string {
  if (!bound) return "no limit";
  if (bound.min !== undefined && bound.max !== undefined) return `${bound.min} – ${bound.max}`;
  if (bound.min !== undefined) return `≥ ${bound.min}`;
  if (bound.max !== undefined) return `≤ ${bound.max}`;
  return "no limit";
}
