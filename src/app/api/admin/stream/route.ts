import { errorResponse } from "@/lib/server/http.ts";
import { requireAdmin } from "@/lib/server/owner.ts";
import { sseStream } from "@/lib/server/sse.ts";
import { sweepInBackground } from "@/lib/server/sweep.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/** The operator board: every session, and the refusals as they happen. */
export async function GET() {
  try {
    await requireAdmin();
    return sseStream({
      poll: async () => {
        // Keeps the board from reporting negotiations that stopped days ago.
        sweepInBackground();
        return {
          sessions: await store.listSessions({ limit: 40 }),
          events: await store.listEvents({ limit: 40 }),
          // Totals come from the store, not from the rows above: the lists are
          // one page, and counting them would under-report everything older.
          counts: await store.countSessions(),
          refusals: await store.countEvents({ kind: "refusal" }),
          // The board is replaced wholesale on every update, so anything the
          // page rendered server-side has to be sent again or the tile empties.
          listed: (await store.listItems({ limit: 200 })).length,
          at: new Date().toISOString(),
        };
      },
      intervalMs: 700,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
