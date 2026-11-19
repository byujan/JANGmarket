import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/**
 * One photograph from a listing.
 *
 * Behind sign-in, because the market itself is: an instance's listings are not
 * public, and an unguarded image route would be the one way to read them
 * without an account. Cached hard all the same — a listing's photographs are
 * replaced as a set under a new position, never edited in place.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string; position: string }> },
) {
  try {
    await requireOwner();
    const { itemId, position } = await params;
    const image = await store.getItemImage(itemId, Number(position));
    if (!image?.bytes) return new Response("not found", { status: 404 });

    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.mime,
        "content-length": String(image.bytes.length),
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
