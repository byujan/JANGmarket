/**
 * Competition should hurry an agent, not panic it.
 *
 * The pressure comes only from how many rivals there are against how many
 * units remain, both of which the market view already carries. No rival's
 * limits are involved.
 */
import { describe, expect, it } from "vitest";
import { MAX_COMPETITIVE_PRESSURE, competitivePressure } from "./rule-strategy.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Market } from "../src/lib/jang/types.ts";

const view = (market?: Market): SessionView =>
  ({ market }) as unknown as SessionView;

describe("competitive pressure", () => {
  it("is nothing when an agent is the only one negotiating", () => {
    expect(competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 1 }))).toBe(0);
  });

  it("is nothing when the market is not reported at all", () => {
    expect(competitivePressure(view())).toBe(0);
  });

  it("rises with the number of rivals for a single unit", () => {
    const two = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 2 }));
    const five = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 5 }));
    expect(two).toBeGreaterThan(0);
    expect(five).toBeGreaterThan(two);
  });

  it("falls as more units become available to go round", () => {
    const scarce = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 4 }));
    const plenty = competitivePressure(view({ remaining: 8, authorised: 8, openSessions: 4 }));
    expect(plenty).toBeLessThan(scarce);
  });

  it("never exceeds the cap, however many rivals arrive", () => {
    const crowded = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 500 }));
    expect(crowded).toBeLessThanOrEqual(MAX_COMPETITIVE_PRESSURE);
    expect(crowded).toBeGreaterThan(0.4);
  });

  it("leaves a single rival uncomfortable rather than desperate", () => {
    // One other bidder for one unit should hurry an agent, not fold it.
    const one = competitivePressure(view({ remaining: 1, authorised: 1, openSessions: 2 }));
    expect(one).toBeGreaterThan(0.1);
    expect(one).toBeLessThan(0.25);
  });

  it("is nothing once an agent has nothing left to commit", () => {
    expect(competitivePressure(view({ remaining: 0, authorised: 1, openSessions: 6 }))).toBe(0);
  });
});
