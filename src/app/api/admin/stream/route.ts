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
        at: new Date().toISOString(),
      }),
      intervalMs: 700,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
