import { redirect } from "next/navigation";
import { OperationsBoard } from "@/components/OperationsBoard.tsx";
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

  const [sessions, events, counts, refusals] = await Promise.all([
    store.listSessions({ limit: 40 }),
    store.listEvents({ limit: 40 }),
    store.countSessions(),
    store.countEvents({ kind: "refusal" }),
  ]);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Operations</h1>
        <p>
          Every negotiation on JANG, as it happens, across all agents rather than only your own. That is why these
          totals are larger than the ones in the status bar above. Refusals sit beside agreements here because a
          blocked offer is the authority model working.
        </p>
      </div>
      <OperationsBoard initial={{ sessions, events, counts, refusals, at: new Date().toISOString() }} />
    </main>
  );
}
