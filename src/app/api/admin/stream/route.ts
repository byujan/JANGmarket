import { errorResponse } from "@/lib/server/http.ts";
import { requireAdmin } from "@/lib/server/owner.ts";
import { sseStream } from "@/lib/server/sse.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

/** The operator board: every session, and the refusals as they happen. */
export async function GET() {
  try {
    await requireAdmin();
    return sseStream({
      poll: async () => ({
        sessions: await store.listSessions({ limit: 40 }),
        events: await store.listEvents({ limit: 40 }),
        // Totals come from the store, not from the rows above: the lists are
        // one page, and counting them would under-report everything older.
        counts: await store.countSessions(),
        refusals: await store.countEvents({ kind: "refusal" }),
        at: new Date().toISOString(),
      }),
      intervalMs: 700,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
