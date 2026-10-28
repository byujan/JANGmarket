import { NextResponse } from "next/server";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { sessionId } = await context.params;
    return NextResponse.json(await jang.viewSession(agent.agentId, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
