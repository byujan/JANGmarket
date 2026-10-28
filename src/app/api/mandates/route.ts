import { NextResponse } from "next/server";
import { agentKeyOf, errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** An owner lodges a signed mandate for their agent. It is never shared. */
export async function POST(request: Request) {
  try {
    const agent = await jang.authenticate(agentKeyOf(request));
    const result = await jang.lodgeMandate(agent.agentId, await request.json());
    return NextResponse.json({ lodged: true, ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
