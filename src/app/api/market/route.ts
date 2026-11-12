import { NextResponse } from "next/server";
import { marketFor } from "@/lib/server/discovery.ts";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** Everything an agent could negotiate over, from that agent's point of view. */
export async function GET(request: Request) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    return NextResponse.json({ items: await marketFor(agent.agentId, agent.ownerId) });
  } catch (error) {
    return errorResponse(error);
  }
}
