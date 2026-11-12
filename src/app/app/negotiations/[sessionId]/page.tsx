import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveNegotiation } from "@/components/LiveNegotiation.tsx";
import { redactSessionFor } from "@/lib/jang/session.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function Negotiation({ params }: { params: Promise<{ sessionId: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const { sessionId } = await params;
  const session = await store.getSession(sessionId);
  if (!session) notFound();

  // Which side is theirs? The view is built for that agent, so an owner sees
  // their own mandate and never the counterparty's.
  const owned = await Promise.all(
    [session.participants.buyer, session.participants.seller].map(async (agentId) => {
      const agent = await store.getAgent(agentId);
      return agent?.ownerId === owner.ownerId ? agentId : undefined;
    }),
  );
  const viewerAgentId = owned.find(Boolean);
  if (!viewerAgentId) notFound();

  const view = redactSessionFor(viewerAgentId, session);
  const agreement = session.agreementId ? await store.getAgreement(session.agreementId) : undefined;

  return (
    <main className="page page-wide">
      <p className="small mute" style={{ marginBottom: "0.75rem" }}>
        <Link href="/app/negotiations">Negotiations</Link> <span className="faint">/</span>{" "}
        <span className="mono">{session.sessionId}</span>
      </p>
      <LiveNegotiation sessionId={sessionId} initial={{ view, agreement }} />
    </main>
  );
}
