import { NextResponse } from "next/server";
import { z } from "zod";
import { RoleSchema } from "@/lib/jang/types.ts";
import { errorResponse } from "@/lib/server/http.ts";
import { requireOwner } from "@/lib/server/owner.ts";
import { suggestTerms } from "@/lib/server/suggest-terms.ts";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  termsNote: z.string().max(2000).optional(),
  listedRole: RoleSchema,
});

/** What the advertisement suggests could be negotiable besides price. */
export async function POST(request: Request) {
  try {
    await requireOwner();
    const body = BodySchema.parse(await request.json());
    return NextResponse.json(await suggestTerms(body));
  } catch (error) {
    return errorResponse(error);
  }
}
