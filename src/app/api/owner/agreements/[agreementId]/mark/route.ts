import { NextResponse } from "next/server";
import { z } from "zod";
import { MARKS } from "@/lib/jang/settlement.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { markSettlement } from "@/lib/server/settlement.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mark: z.enum(MARKS),
  note: z.string().max(400).optional(),
});

/** An owner says what became of an agreement they are a party to. */
export async function POST(request: Request, { params }: { params: Promise<{ agreementId: string }> }) {
  try {
    const owner = await requireOwner();
    const { agreementId } = await params;
    const { mark, note } = BodySchema.parse(await request.json());
    const settlement = await markSettlement({ agreementId, ownerId: owner.ownerId, mark, note });
    return NextResponse.json(settlement);
  } catch (error) {
    return errorResponse(error);
  }
}
