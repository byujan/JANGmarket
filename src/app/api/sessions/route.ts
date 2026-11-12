import { NextResponse } from "next/server";
import { z } from "zod";
import { ItemSpecSchema } from "@/lib/jang/types.ts";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { playHouseSide } from "@/lib/server/marketplace.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  counterpartyAgentId: z.string().min(1),
  itemSpec: ItemSpecSchema,
  maxRounds: z.number().int().positive().max(100).optional(),
  ttlSeconds: z.number().int().positive().max(86_400).optional(),
});

export async function POST(request: Request) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const body = BodySchema.parse(await request.json());
    const view = await jang.openSession({ agentId: agent.agentId, ...body });
    // Opened against the house, the house starts bargaining back. Opened
    // against another owner's agent, it is for that agent to answer.
    const houseIsPlaying = await playHouseSide(view.sessionId, body.counterpartyAgentId);
    return NextResponse.json({ ...view, houseIsPlaying }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
