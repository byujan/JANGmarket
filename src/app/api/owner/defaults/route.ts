import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  expiryDays: z.number().int().min(1).max(365).optional(),
  disclosePriorities: z.boolean().optional(),
  agentId: z.string().max(60).optional(),
  moneyFirst: z.boolean().optional(),
  usuallyNoFallback: z.boolean().optional(),
});

/**
 * Where this owner's limits start.
 *
 * Authority is never set here. JANG checks an offer against the signed mandate
 * for that item and nothing else; this only decides what the form is
 * pre-filled with.
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const defaults = BodySchema.parse(await request.json());
    await store.putOwnerDefaults(owner.ownerId, defaults);
    return NextResponse.json(defaults);
  } catch (error) {
    return errorResponse(error);
  }
}
