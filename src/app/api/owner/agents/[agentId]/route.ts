import { NextResponse } from "next/server";
import { z } from "zod";
import { JangError } from "@/lib/jang/types.ts";
import { POSTURES } from "@/lib/posture.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  label: z.string().min(1).max(60).optional(),
  posture: z.enum(POSTURES).optional(),
  brief: z.string().max(600).optional(),
});

/**
 * Change what an owner may change about their own agent.
 *
 * Not the id: it is inside every mandate the agent already holds, and those
 * are signed, so renaming it would orphan its authority. Not the key either —
 * only its hash is stored, and a new one would be a new agent in all but name.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const owner = await requireOwner();
    const { agentId } = await params;

    const agent = await store.getAgent(agentId);
    if (!agent || agent.ownerId !== owner.ownerId) {
      throw new JangError("NOT_FOUND", `no agent ${agentId} of yours`);
    }

    const patch = BodySchema.parse(await request.json());
    await store.updateAgent(agentId, {
      ...(patch.label === undefined ? {} : { label: patch.label }),
      ...(patch.posture === undefined ? {} : { posture: patch.posture }),
      ...(patch.brief === undefined ? {} : { brief: patch.brief.trim() }),
    });
    return NextResponse.json(await store.getAgent(agentId));
  } catch (error) {
    return errorResponse(error);
  }
}
