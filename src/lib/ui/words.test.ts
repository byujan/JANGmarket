import { describe, expect, it } from "vitest";
import { agreedWords, standingWords, statusWords, walkAwayWords } from "./words.ts";

describe("console words", () => {
  it("turns statuses into words a person reads", () => {
    expect(statusWords("failed")).toBe("No deal");
    expect(statusWords("expired")).toBe("Timed out");
    expect(statusWords("open")).toBe("In progress");
    expect(statusWords("something-new")).toBe("something-new");
  });

  it("never shows the walk-away number", () => {
    for (const r of [0, 0.41, 0.9]) {
      for (const text of [walkAwayWords(r), standingWords(0.5, r), agreedWords(r)]) {
        expect(text).not.toMatch(/\d/);
        expect(text).not.toMatch(/reservation/i);
      }
    }
  });

  it("says whether the package on the table clears the fallback", () => {
    expect(standingWords(0.6, 0.4)).toMatch(/better for you/);
    expect(standingWords(0.3, 0.4)).toMatch(/will not accept/);
    expect(standingWords(0.3, 0)).toMatch(/inside your limits/);
  });
});
