import { describe, expect, it } from "vitest";
import { DEFAULT_POSTURE, POSTURES, isPosture, toughnessOf } from "./posture.ts";

describe("posture", () => {
  it("orders the dial from quick to concede to barely moving", () => {
    const schedule = POSTURES.map(toughnessOf);
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i]).toBeGreaterThan(schedule[i - 1]!);
    }
  });

  it("leaves an agent registered before posture existed behaving as it did", () => {
    // The console ran the owner's side at 1.5-1.6 before there was a dial.
    expect(toughnessOf(undefined)).toBe(toughnessOf(DEFAULT_POSTURE));
    expect(toughnessOf(undefined)).toBeCloseTo(1.6, 5);
  });

  it("concedes earlier when amenable than when aggressive", () => {
    // The schedule is target = ceiling - (ceiling - floor) * elapsed^toughness,
    // so at the same point in the session a softer agent is asking for less.
    // With a ceiling of 1 and a floor of 0 that is simply 1 - elapsed^toughness.
    const askAt = (elapsed: number, posture: (typeof POSTURES)[number]) =>
      1 - Math.pow(elapsed, toughnessOf(posture));
    for (const elapsed of [0.25, 0.5, 0.75]) {
      expect(askAt(elapsed, "amenable")).toBeLessThan(askAt(elapsed, "aggressive"));
    }
  });

  it("rejects anything that is not a posture, including near misses", () => {
    expect(isPosture("aggressive")).toBe(true);
    expect(isPosture("Aggressive")).toBe(false);
    expect(isPosture("very aggressive")).toBe(false);
    expect(isPosture(undefined)).toBe(false);
    expect(isPosture(2.6)).toBe(false);
  });
});
