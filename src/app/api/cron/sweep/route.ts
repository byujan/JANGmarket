import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/http.ts";
import { sweepExpired } from "@/lib/server/sweep.ts";

export const dynamic = "force-dynamic";

/**
 * Close sessions whose time has run out.
 *
 * The console sweeps opportunistically as people look at it, which is enough
 * for a local instance but not for one nobody is watching. Vercel Cron calls
 * this on a schedule and sends CRON_SECRET as a bearer token; when that
 * variable is set the endpoint accepts nothing else, so a scheduled job is the
 * only thing that can drive it.
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "bad cron secret" } }, { status: 401 });
    }
    return NextResponse.json({ expired: await sweepExpired() });
  } catch (error) {
    return errorResponse(error);
  }
}
