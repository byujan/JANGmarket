import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { JangError, type JangErrorCode } from "../jang/types.ts";

const STATUS: Record<JangErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_A_PARTICIPANT: 403,
  NOT_FOUND: 404,
  MANDATE_VIOLATION: 422,
  NOT_YOUR_TURN: 409,
  SESSION_EXPIRED: 409,
  SESSION_CLOSED: 409,
  ROUND_LIMIT: 409,
  NO_STANDING_OFFER: 409,
  AMBIGUOUS_ACCEPT: 400,
  INVALID_TERMS: 400,
  INVALID_MANDATE: 400,
};

export type ErrorPayload = {
  error: { code: string; message: string; violations?: unknown };
};

/**
 * Errors are data, not exceptions, by the time they reach an agent: a
 * negotiating agent needs to read a refusal and try something else.
 */
export function errorResponse(error: unknown): NextResponse<ErrorPayload> {
  if (error instanceof JangError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, violations: error.violations } },
      { status: STATUS[error.code] ?? 400 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : "unexpected error";
  return NextResponse.json({ error: { code: "INTERNAL", message } }, { status: 500 });
}

export function agentKeyOf(request: Request): string | null {
  return request.headers.get("x-agent-key");
}
