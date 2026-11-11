import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DimensionSchema, JangError, RoleSchema } from "@/lib/jang/types.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(600).optional(),
  /** The side the person listing it takes; the other is open to a counterparty. */
  listedRole: RoleSchema,
  dimensions: z.array(DimensionSchema).min(1).max(8),
});

/**
 * List an item with the terms its owner is willing to negotiate over.
 *
 * The limits stay private and are signed separately in the browser, exactly as
 * for a built-in market. What is public here is only what is negotiable and
 * the range each term may move across, which a counterparty has to know to
 * make an offer at all.
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = BodySchema.parse(await request.json());

    for (const dimension of body.dimensions) {
      if (dimension.max <= dimension.min) {
        throw new JangError(
          "INVALID_TERMS",
          `"${dimension.label}" needs a range to move across: its most must be above its least`,
        );
      }
      if (dimension.step > dimension.max - dimension.min) {
        throw new JangError(
          "INVALID_TERMS",
          `"${dimension.label}" steps further than its whole range, so it has nowhere to go`,
        );
      }
    }

    const keys = body.dimensions.map((d) => d.key);
    if (new Set(keys).size !== keys.length) {
      throw new JangError("INVALID_TERMS", "two terms share a name; each needs its own");
    }

    const itemId = `item_${randomUUID()}`;
    await store.putItem({
      itemId,
      ownerId: owner.ownerId,
      title: body.title,
      description: body.description,
      listedRole: body.listedRole,
      dimensions: body.dimensions,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ itemId, title: body.title }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Everything this owner has listed. */
export async function GET() {
  try {
    const owner = await requireOwner();
    return NextResponse.json({ items: await store.listItems({ ownerId: owner.ownerId }) });
  } catch (error) {
    return errorResponse(error);
  }
}
