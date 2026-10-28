import { NextResponse } from "next/server";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** Readiness, plus the public key agents need to verify agreements. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "jang", jangPublicKey: jang.publicKey });
}
