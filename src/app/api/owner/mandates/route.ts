import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/http.ts";
import { JangError, MandateSchema } from "@/lib/jang/types.ts";
import { verifyMandate } from "@/lib/jang/mandate.ts";
import { bindOwnerKey, requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * Lodge a mandate the owner signed in their browser.
 *
 * The server checks three things it cannot fake: the signature verifies, the
 * key is the one registered to this account, and the agent belongs to them.
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const mandate = MandateSchema.parse(await request.json());

    if (mandate.ownerId !== owner.ownerId) {
      throw new JangError("UNAUTHORIZED", "this mandate names a different owner");
    }
    const agent = await store.getAgent(mandate.agentId);
    if (!agent || agent.ownerId !== owner.ownerId) {
      throw new JangError("UNAUTHORIZED", "that agent does not belong to you");
    }
    if (!verifyMandate(mandate)) {
      throw new JangError("INVALID_MANDATE", "the signature on this mandate does not verify");
    }
    await bindOwnerKey(owner, mandate);
    await store.putMandate(mandate);

    return NextResponse.json({ lodged: true, mandateId: mandate.mandateId, itemId: mandate.itemId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
