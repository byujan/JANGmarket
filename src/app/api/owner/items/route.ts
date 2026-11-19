import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { priceDimension } from "@/lib/jang/asking.ts";
import { DimensionSchema, JangError, RoleSchema } from "@/lib/jang/types.ts";
import { decodeAll, MAX_IMAGES } from "@/lib/server/images.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().min(3).max(120),
  /** Free text, the way a classified ad is written. */
  description: z.string().max(4000).optional(),
  /** The side the person listing it takes; the other is open to a counterparty. */
  listedRole: RoleSchema,
  /** The headline figure. JANG builds the price term from it. */
  askingPrice: z.number().positive().max(100_000_000).optional(),
  /**
   * What else the lister is open to, in prose. Context for the negotiating
   * agents, never a term: nothing here is enforced or signed.
   */
  termsNote: z.string().max(2000).optional(),
  /** Declared by hand, for a caller that wants terms JANG will enforce. */
  dimensions: z.array(DimensionSchema).max(8).optional(),
  /** base64 `data:` URLs, already resized by the browser. */
  images: z.array(z.string()).max(MAX_IMAGES).optional(),
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

    // A free-form listing names a price and nothing else, so the price term is
    // built from it. Anyone who wants delivery dates and warranties still
    // declares them by hand, and a listing with neither has nothing to haggle
    // over at all.
    const declared = body.dimensions ?? [];
    if (body.askingPrice !== undefined && declared.some((d) => d.key === "price")) {
      throw new JangError(
        "INVALID_TERMS",
        "this listing names an asking price and also declares a price term; keep one of them",
      );
    }
    const dimensions =
      body.askingPrice === undefined
        ? declared
        : // The derived price term comes first, and anything declared is in
          // addition to it. Dropping it because an extra term was added would
          // quietly leave the listing haggling over delivery and not money.
          [priceDimension(body.askingPrice), ...declared];
    if (dimensions.length === 0) {
      throw new JangError(
        "INVALID_TERMS",
        "a listing needs either an asking price or at least one term to negotiate over",
      );
    }

    const images = decodeAll(body.images);

    for (const dimension of dimensions) {
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

    const keys = dimensions.map((d) => d.key);
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
      ...(body.askingPrice === undefined ? {} : { askingPrice: body.askingPrice }),
      ...(body.termsNote?.trim() ? { termsNote: body.termsNote.trim() } : {}),
      dimensions,
      createdAt: new Date().toISOString(),
    });
    if (images.length > 0) await store.putItemImages(itemId, images);

    return NextResponse.json({ itemId, title: body.title, images: images.length }, { status: 201 });
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
