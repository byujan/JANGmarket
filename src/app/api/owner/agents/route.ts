import { NextResponse } from "next/server";
import { z } from "zod";
import { POSTURES } from "@/lib/posture.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  label: z.string().min(1).max(60),
  posture: z.enum(POSTURES).optional(),
  /** Prose for agents that read it. Capped so it cannot become a novel. */
  brief: z.string().max(600).optional(),
  /** Lowercase, url-safe; the agent announces itself with this. */
  agentId: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "use lowercase letters, numbers and hyphens"),
});

/** Register an agent under the signed-in owner. The key is shown exactly once. */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const { agentId, label, posture, brief } = BodySchema.parse(await request.json());
    const { apiKey } = await jang.registerAgent({
      agentId,
      ownerId: owner.ownerId,
      label,
      posture,
      brief: brief?.trim() || undefined,
    });
    return NextResponse.json({ agentId, label, apiKey }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
