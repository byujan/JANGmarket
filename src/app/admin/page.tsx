import { redirect } from "next/navigation";
import { DilemmaChart } from "@/components/DilemmaChart.tsx";
import { OperationsBoard } from "@/components/OperationsBoard.tsx";
import { jang } from "@/lib/server/service.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function Operations() {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  if (!owner.isAdmin) {
    return (
      <main className="page page-wide">
        <div className="page-head">
          <h1>Operations</h1>
        </div>
        <div className="notice notice-warn">
          This view is for JANG operators. Add your address to <code>JANG_ADMIN_EMAILS</code> if it should be yours.
        </div>
      </main>
    );
  }

  const [sessions, events, counts, refusals, readings, listings] = await Promise.all([
    store.listSessions({ limit: 40 }),
    store.listEvents({ limit: 40 }),
    store.countSessions(),
    store.countEvents({ kind: "refusal" }),
    jang.operatorReadings(),
    store.listItems({ limit: 200 }),
  ]);

  const onFrontier = readings.filter((r) => r.paretoOptimal).length;
  const meanCreated = readings.length
    ? readings.reduce((sum, r) => sum + r.created, 0) / readings.length
    : 0;
  const meanClaimed = readings.length
    ? readings.reduce((sum, r) => sum + r.claimed, 0) / readings.length
    : 0;

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Operations</h1>
        <p>
          Every negotiation on JANG, as it happens, across all agents rather than only your own. The status bar
          above reports the same instance while you are signed in as an operator, so the two agree. Refusals sit
          beside agreements here because a blocked offer is the authority model working.
        </p>
      </div>
      <OperationsBoard
        initial={{ sessions, events, counts, refusals, listed: listings.length, at: new Date().toISOString() }}
      />

      <section className="section enter" style={{ "--i": 5 } as React.CSSProperties}>
        <div className="panel">
          <div className="panel-head">
            <h2>Creating and claiming</h2>
            <span className="panel-meta">
              {readings.length} closed {readings.length === 1 ? "deal" : "deals"} · {onFrontier} on the frontier
            </span>
          </div>
          <div className="panel-body">
            <p className="hint" style={{ marginTop: 0 }}>
              Every negotiator is doing two things at once: making the pie bigger and taking a share of it. A deal
              far to the right used the trades available; one near the dashed line split what it made evenly.
              Points below the frontier mark value both owners could have had and did not.
            </p>
            <div className="chart-row">
              <DilemmaChart points={readings} />
              <div>
                <dl className="cards" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
                  <div className="card">
                    <dt>Mean value created</dt>
                    <dd className="mono">{(meanCreated * 100).toFixed(0)}%</dd>
                    <span className="card-foot">of the most these owners could have had</span>
                  </div>
                  <div className="card">
                    <dt>Mean buyer share</dt>
                    <dd className="mono">{(meanClaimed * 100).toFixed(0)}%</dd>
                    <span className="card-foot">0.5 would be an even split of the surplus</span>
                  </div>
                  <div className="card">
                    <dt>Reached the frontier</dt>
                    <dd className="mono">
                      {onFrontier}/{readings.length}
                    </dd>
                    <span className="card-foot">no package was better for both</span>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
