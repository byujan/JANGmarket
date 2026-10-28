import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { redactSessionFor } from "@/lib/jang/session.ts";
import { JangError } from "@/lib/jang/types.ts";
import { sseStream } from "@/lib/server/sse.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * A live view of one negotiation, scoped to the owner watching it.
 *
 * The payload goes through redactSessionFor, so an owner watching their own
 * agent still cannot see the counterparty's mandate.
 */
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const owner = await requireOwner();
    const { sessionId } = await context.params;

    const session = await store.getSession(sessionId);
    if (!session) throw new JangError("NOT_FOUND", `no session ${sessionId}`);

    const mine = await Promise.all(
      [session.participants.buyer, session.participants.seller].map(async (agentId) => {
        const agent = await store.getAgent(agentId);
        return agent?.ownerId === owner.ownerId ? agentId : undefined;
      }),
    );
    const viewerAgentId = mine.find(Boolean);
    if (!viewerAgentId && !owner.isAdmin) {
      throw new JangError("NOT_A_PARTICIPANT", "none of your agents is in this negotiation");
    }

    return sseStream({
      poll: async () => {
        const current = await store.getSession(sessionId);
        if (!current) throw new JangError("NOT_FOUND", `session ${sessionId} vanished`);
        const view = redactSessionFor(viewerAgentId ?? current.participants.buyer, current);
        const agreement = current.agreementId ? await store.getAgreement(current.agreementId) : undefined;
        return { view, agreement };
      },
      done: (payload) => payload.view.status !== "open",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
