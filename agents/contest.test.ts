/**
 * What a model is told about the contest has to point the same way the rule
 * strategy does: a seller courted by several buyers is strong. Nothing is said
 * about how many others a counterparty is negotiating with, because JANG does
 * not report it.
 */
import { describe, expect, it } from "vitest";
import { contestLines } from "./contest.ts";

describe("contestLines", () => {
  it("tells a courted seller it has alternatives", () => {
    const text = contestLines({ remaining: 1, authorised: 1, openSessions: 6 }).join(" ");
    expect(text).toContain("you have alternatives");
    expect(text).not.toContain("weakens your position");
  });

  it("tells a lone buyer nothing about anyone else's negotiations", () => {
    const text = contestLines({ remaining: 1, authorised: 1, openSessions: 1 }).join(" ");
    expect(text).toContain("no other negotiation of your own");
    expect(text).not.toMatch(/counterparty is negotiating|weakens your position|you have alternatives/);
  });

  it("says nothing about contest when there is none", () => {
    const text = contestLines({ remaining: 3, authorised: 3, openSessions: 1 }).join(" ");
    expect(text).toBe("");
  });
});
