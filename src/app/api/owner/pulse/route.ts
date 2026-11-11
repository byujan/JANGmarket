import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * What the status bar counts. An operator gets the whole instance, matching
 * the operations page; everyone else gets their own agents. Fetched after the
 * page has painted, so a count never sits between a click and the content.
 */
export async function GET() {
  try {
    const owner = await requireOwner();

    // An operator is responsible for the whole instance, so the bar reports
    // the whole instance and agrees with /admin. An ordinary owner is
    // responsible for their own agents, and sees only those.
    if (owner.isAdmin) {
      const counts = await store.countSessions();
      return NextResponse.json({ negotiating: counts.open, agreed: counts.agreed, scope: "all" });
    }

    const agents = await store.listAgentsByOwner(owner.ownerId);
    if (agents.length === 0) {
      return NextResponse.json({ negotiating: 0, agreed: 0, scope: "yours" });
    }
    const counts = await store.countSessions({ agentIds: agents.map((agent) => agent.agentId) });
    return NextResponse.json({ negotiating: counts.open, agreed: counts.agreed, scope: "yours" });
  } catch (error) {
    return errorResponse(error);
  }
}
