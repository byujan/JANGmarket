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

    const sessions = await store.listSessions({ agentIds: agents.map((agent) => agent.agentId), limit: 200 });
    return NextResponse.json({
      negotiating: sessions.filter((session) => session.status === "open").length,
      agreed: sessions.filter((session) => session.status === "agreed").length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
