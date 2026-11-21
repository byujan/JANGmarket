/**
 * Which open sessions count toward the contest for an item. Counting is all
 * this decides: an idle session is never closed by it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createSession, submitOffer } from "../jang/session.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "../jang/testing.ts";
import { DEFAULT_IDLE_SECONDS, idleAfterMs, isContending, lastActivity } from "./liveness.ts";

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
const session = (openedMinutesAgo: number, ttlSeconds = 900) =>
  createSession({
    sessionId: "sess-live",
    itemSpec: testItemSpec,
    buyerAgentId: "agent-buyer",
    sellerAgentId: "agent-seller",
    mandates: [buyerMandate(), sellerMandate()],
    ttlSeconds,
    now: at(openedMinutesAgo),
  });
const terms = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

describe("isContending", () => {
  afterEach(() => {
    delete process.env.JANG_IDLE_SECONDS;
  });

  it("counts a session just opened", () => {
    expect(isContending(session(0))).toBe(true);
  });

  it("stops counting one nobody has moved in for longer than the window", () => {
    expect(isContending(session(10))).toBe(false);
  });

  it("counts it again the moment someone makes an offer", () => {
    const moved = submitOffer(session(10), "agent-buyer", terms, { offerId: "o1", now: at(1) }).session;
    expect(lastActivity(moved)).toBeGreaterThan(Date.now() - 2 * 60_000);
    expect(isContending(moved)).toBe(true);
  });

  it("never counts an expired one, however recent its last offer", () => {
    const expired = submitOffer(session(3, 60), "agent-buyer", terms, { offerId: "o2", now: at(2.5) }).session;
    expect(isContending(expired)).toBe(false);
  });

  it("takes the window from JANG_IDLE_SECONDS, and ignores nonsense", () => {
    expect(idleAfterMs()).toBe(DEFAULT_IDLE_SECONDS * 1000);
    process.env.JANG_IDLE_SECONDS = "1200";
    expect(isContending(session(10))).toBe(true);
    process.env.JANG_IDLE_SECONDS = "-5";
    expect(idleAfterMs()).toBe(DEFAULT_IDLE_SECONDS * 1000);
  });
});
