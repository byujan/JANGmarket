import { NextResponse } from "next/server";
import { z } from "zod";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const TermsBody = z.record(z.string(), z.number());
const BodySchema = z.object({
  terms: TermsBody,
  /** MESO: up to two more packages, equally acceptable to you, offered in the same turn. */
  alternatives: z.array(TermsBody).max(2).optional(),
  note: z.string().max(500).optional(),
});

/** One endpoint serves both an opening offer and a counteroffer. */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const { sessionId } = await context.params;
    const { terms, alternatives, note } = BodySchema.parse(await request.json());
    const view = await jang.makeOffer({ agentId: agent.agentId, sessionId, terms, alternatives, note });
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
