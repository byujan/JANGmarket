/**
 * Which open sessions count as a live negotiation when telling an agent how
 * contested its item is.
 *
 * Open and unexpired is not enough. A party that walks away leaves its session
 * open until `expiresAt` (fifteen minutes by default, up to a day), and until
 * then it would still read as an alternative to the seller that opened it. So a session also has to have moved recently: an offer, or its
 * opening, within the idle window.
 *
 * This only changes what is counted. An idle session is not closed: its
 * standing offer can still be accepted until it expires, and an offer made in
 * it makes it count again at once.
 */
import type { Session } from "../jang/types.ts";

export const DEFAULT_IDLE_SECONDS = 300;

/** The idle window, from `JANG_IDLE_SECONDS` when it is a positive number. */
export function idleAfterMs(): number {
  const raw = Number(process.env.JANG_IDLE_SECONDS);
  return (Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_IDLE_SECONDS) * 1000;
}

/** When anything last happened in a session: its latest offer, or its opening. */
export function lastActivity(session: Session): number {
  let last = new Date(session.createdAt).getTime();
  for (const offer of session.offers) last = Math.max(last, new Date(offer.createdAt).getTime());
  return last;
}

/** Open, unexpired, and active within the idle window. */
export function isContending(session: Session, now = Date.now(), idleMs = idleAfterMs()): boolean {
  return (
    session.status === "open" &&
    new Date(session.expiresAt).getTime() > now &&
    lastActivity(session) > now - idleMs
  );
}
