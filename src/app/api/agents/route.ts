import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ agentId: z.string().min(1), ownerId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { agentId, ownerId } = BodySchema.parse(await request.json());
    const { agent, apiKey } = await jang.registerAgent({ agentId, ownerId });
    return NextResponse.json({ agentId: agent.agentId, ownerId: agent.ownerId, apiKey }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
