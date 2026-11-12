import { NextResponse } from "next/server";
import { marketItemFor } from "@/lib/server/discovery.ts";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** One item in full, including who to open a session against. */
export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { itemId } = await params;
    return NextResponse.json(await marketItemFor(itemId, agent.agentId, agent.ownerId));
  } catch (error) {
    return errorResponse(error);
  }
}
