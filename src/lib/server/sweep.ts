/**
 * Closing sessions that have stopped.
 *
 * A session only ever left `open` by being agreed. Nothing marked the rest,
 * so every negotiation that ran out of time stayed open forever and the
 * instance reported them as live: an operations board saying ten negotiations
 * are in flight when all ten stopped days ago is worse than one saying
 * nothing, because it looks like information.
 *
 * Expiry is the only terminal condition. Running out of rounds is not: a
 * session at its round limit can take no new offers, but the standing offer
 * can still be accepted until the clock runs out, and closing it early would
 * throw away a deal that was still there to take.
 */
import { store } from "../store/index.ts";

/**
 * At most one sweep per window per process. The update is idempotent, so
 * several instances racing costs nothing but noise; this keeps a busy page
 * from issuing one on every poll.
 */
const EVERY_MS = 30_000;
const recent = globalThis as unknown as { __jangLastSweep?: number };

export async function sweepExpired(now = new Date()): Promise<number> {
  return store.expireStaleSessions(now);
}

/**
 * For pages and polls: sweeps if it has not swept lately, and never makes the
 * caller wait on it or fail because of it. Reading a board is not the place to
 * discover the database is down.
 */
export function sweepInBackground(): void {
  const last = recent.__jangLastSweep ?? 0;
  if (Date.now() - last < EVERY_MS) return;
  recent.__jangLastSweep = Date.now();
  void sweepExpired().catch(() => {
    // Let the next caller try again rather than wedging on one failure.
    recent.__jangLastSweep = 0;
  });
}
