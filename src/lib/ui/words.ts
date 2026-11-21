/**
 * Plain words for the owner console.
 *
 * Owners set their limits by describing a fallback, never a number, so the
 * console should not hand the number back to them either. Statuses and sides
 * get the same treatment: the data says `failed`, a person reads "No deal".
 * The admin pages keep the raw values on purpose.
 */
import type { Role } from "../jang/types.ts";

export type SessionStatus = "open" | "agreed" | "failed" | "expired";

const STATUS_WORDS: Record<SessionStatus, string> = {
  open: "In progress",
  agreed: "Deal",
  failed: "No deal",
  expired: "Timed out",
};

export function statusWords(status: string): string {
  return STATUS_WORDS[status as SessionStatus] ?? status;
}

export function sideWords(role: Role): string {
  return role === "buyer" ? "buying" : "selling";
}

/** What the walk-away point means, without the number behind it. */
export function walkAwayWords(reservationUtility: number): string {
  return reservationUtility <= 0
    ? "Any deal inside your limits"
    : "Only deals better than your fallback";
}

/**
 * How the best package on the table compares with what the owner would take,
 * in words. The agent will not accept anything below the walk-away point.
 */
export function standingWords(value: number, reservationUtility: number): string {
  if (reservationUtility <= 0) return "is inside your limits, so your agent could accept it.";
  if (value >= reservationUtility) return "is better for you than your fallback, so your agent could accept it.";
  return "is not yet as good as your fallback, so your agent will not accept it.";
}

/** One line for a closed deal. */
export function agreedWords(reservationUtility: number): string {
  return reservationUtility <= 0
    ? "It is inside every limit you set."
    : "It is inside every limit you set and better for you than your fallback.";
}
