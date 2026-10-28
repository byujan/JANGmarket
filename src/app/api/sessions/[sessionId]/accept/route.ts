import { NextResponse } from "next/server";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { sessionId } = await context.params;
    const { view, agreement } = await jang.accept({ agentId: agent.agentId, sessionId });
    return NextResponse.json({ session: view, agreement });
  } catch (error) {
    return errorResponse(error);
  }
}
