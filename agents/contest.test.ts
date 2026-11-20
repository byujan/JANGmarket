/**
 * What a model is told about the contest has to point the same way the rule
 * strategy does: a seller courted by several buyers is strong, a buyer among
 * several is weak.
 */
import { describe, expect, it } from "vitest";
import { contestLines } from "./contest.ts";

describe("contestLines", () => {
  it("tells a courted seller it has alternatives, not rivals", () => {
    const text = contestLines({ remaining: 1, authorised: 1, openSessions: 6, rivals: 0 }).join(" ");
    expect(text).toContain("you have alternatives");
    expect(text).not.toContain("weakens your position");
  });

  it("tells a buyer among several that it is weaker", () => {
    const text = contestLines({ remaining: 1, authorised: 1, openSessions: 1, rivals: 5 }).join(" ");
    expect(text).toContain("negotiating with 5 others");
    expect(text).toContain("weakens your position");
    expect(text).not.toContain("you have alternatives");
  });

  it("says nothing about contest when there is none", () => {
    const text = contestLines({ remaining: 3, authorised: 3, openSessions: 1, rivals: 0 }).join(" ");
    expect(text).toBe("");
  });
});
