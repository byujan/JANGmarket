/**
 * Scarcity under a race.
 *
 * Supply used to be counted: the accept path read how many agreements existed
 * and wrote another several awaits later. Six buyers going for one television
 * all read nought, and four of them closed — the benchmark script said so
 * itself, in the words "Oversold: more deals than units."
 *
 * A single-threaded test with one acceptance at a time cannot catch that. The
 * acceptances here are started together and settled together, which is the
 * only shape the bug appears in.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory.ts";

const reserveAll = async (store: MemoryStore, sessions: string[], allowed: number) =>
  Promise.all(
    sessions.map((sessionId) =>
      store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId, allowed }),
    ),
  );

describe("committing a unit of supply", () => {
  it("lets exactly one of six racing sessions through when there is one unit", async () => {
    const store = new MemoryStore();
    const sessions = ["s1", "s2", "s3", "s4", "s5", "s6"];

    const granted = await reserveAll(store, sessions, 1);
    expect(granted.filter(Boolean)).toHaveLength(1);
  });

  it("lets exactly as many through as the mandate authorised", async () => {
    for (const allowed of [1, 2, 3, 5]) {
      const store = new MemoryStore();
      const sessions = Array.from({ length: 8 }, (_, i) => `s${i}`);
      const granted = await reserveAll(store, sessions, allowed);
      expect(granted.filter(Boolean)).toHaveLength(allowed);
    }
  });

  it("treats a second claim from the same session as the same unit", async () => {
    const store = new MemoryStore();
    // An accept retried after a hiccup must not spend a second television.
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s1", allowed: 1 })).toBe(true);
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s1", allowed: 1 })).toBe(true);
    // And the unit it holds is still the only one.
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s2", allowed: 1 })).toBe(false);
  });

  it("gives the unit back when the acceptance it was taken for did not stand", async () => {
    const store = new MemoryStore();
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s1", allowed: 1 })).toBe(true);
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s2", allowed: 1 })).toBe(false);

    await store.releaseSupply("seller", "item-tv", "s1");
    // The next buyer is not starved by a deal that never happened.
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s2", allowed: 1 })).toBe(true);
  });

  it("counts each item separately", async () => {
    const store = new MemoryStore();
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-tv", sessionId: "s1", allowed: 1 })).toBe(true);
    // A seller out of televisions has not run out of bicycles.
    expect(await store.reserveSupply({ agentId: "seller", itemId: "item-bike", sessionId: "s2", allowed: 1 })).toBe(true);
  });
});
