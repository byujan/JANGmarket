import { NextResponse } from "next/server";
import { z } from "zod";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** The body is optional; `offerId` names the package when the standing offer has several. */
const BodySchema = z.object({ offerId: z.string().min(1).optional() });

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { sessionId } = await context.params;
    const text = await request.text();
    const { offerId } = BodySchema.parse(text.trim() ? JSON.parse(text) : {});
    const { view, agreement } = await jang.accept({ agentId: agent.agentId, sessionId, offerId });
    return NextResponse.json({ session: view, agreement });
  } catch (error) {
    return errorResponse(error);
  }
}
