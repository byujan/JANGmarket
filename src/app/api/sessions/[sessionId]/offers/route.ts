import { NextResponse } from "next/server";
import { z } from "zod";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ terms: z.record(z.string(), z.number()), note: z.string().max(500).optional() });

/** One endpoint serves both an opening offer and a counteroffer. */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { sessionId } = await context.params;
    const { terms, note } = BodySchema.parse(await request.json());
    const view = await jang.makeOffer({ agentId: agent.agentId, sessionId, terms, note });
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
