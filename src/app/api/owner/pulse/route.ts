import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * A count of what this owner's agents are doing. Fetched by the header after
 * the page has painted, so it never sits between a click and the content.
 */
export async function GET() {
  try {
    const owner = await requireOwner();
    const agents = await store.listAgentsByOwner(owner.ownerId);
    if (agents.length === 0) return NextResponse.json({ negotiating: 0, agreed: 0 });

    const counts = await store.countSessions({ agentIds: agents.map((agent) => agent.agentId) });
    return NextResponse.json({ negotiating: counts.open, agreed: counts.agreed });
  } catch (error) {
    return errorResponse(error);
  }
}
