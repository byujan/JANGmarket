import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/http.ts";
import { jang } from "@/lib/server/service.ts";

export const dynamic = "force-dynamic";

/** Agreements are public: anyone holding one can check JANG's signature. */
export async function GET(_request: Request, context: { params: Promise<{ agreementId: string }> }) {
  try {
    const { agreementId } = await context.params;
    return NextResponse.json(await jang.getAgreement(agreementId));
  } catch (error) {
    return errorResponse(error);
  }
}
