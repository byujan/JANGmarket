import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/http.ts";
import { launchNegotiation } from "@/lib/server/marketplace.ts";
import { requireOwner } from "@/lib/server/owner.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ agentId: z.string().min(1), itemId: z.string().min(1) });

/** Start a negotiation between the owner's agent and the house agent. */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const { agentId, itemId } = BodySchema.parse(await request.json());
    const { sessionId } = await launchNegotiation({ ownerId: owner.ownerId, agentId, itemId });
    return NextResponse.json({ sessionId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
