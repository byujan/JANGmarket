import { NextResponse } from "next/server";
import { z } from "zod";
import { JangError } from "@/lib/jang/types.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ agentId: z.string().min(1), ownerId: z.string().min(1) });

/**
 * Unauthenticated agent registration, for the command-line demos.
 *
 * Closed unless deliberately opened, because this endpoint hands out a working
 * key to anyone who asks. Signed-in owners register agents through
 * /api/owner/agents instead, which ties the agent to their account.
 */
function registrationIsOpen(): boolean {
  if (process.env.JANG_OPEN_REGISTRATION === "true") return true;
  // A memory-backed instance is a local demo with nothing to protect.
  return !process.env.DATABASE_URL;
}

export async function POST(request: Request) {
  try {
    if (!registrationIsOpen()) {
      throw new JangError(
        "UNAUTHORIZED",
        "open agent registration is disabled; sign in and register the agent from your console",
      );
    }
    const { agentId, ownerId } = BodySchema.parse(await request.json());
    const { agent, apiKey } = await jang.registerAgent({ agentId, ownerId });
    return NextResponse.json({ agentId: agent.agentId, ownerId: agent.ownerId, apiKey }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
