/**
 * The guard on the automatic counterparty.
 *
 * Opening a session now starts the house bargaining back, which is what lets
 * an agent connecting from outside get anywhere on its own. The house is the
 * only agent that may be driven this way: doing it to somebody's real agent
 * would mean JANG negotiating on their behalf without being asked, under a
 * mandate their owner signed for themselves to use.
 */
import { describe, expect, it } from "vitest";
import { HOUSE_OWNER } from "../jang/settlement.ts";
import { buyerMandate } from "../jang/testing.ts";
import { store } from "../store/index.ts";
import { marketItemFor } from "./discovery.ts";
import { playHouseSide } from "./marketplace.ts";
import { jang } from "./service.ts";

const unique = (name: string) => `${name}-${Math.random().toString(36).slice(2, 8)}`;

describe("playHouseSide", () => {
  it("refuses to drive an agent that belongs to a person", async () => {
    const agentId = unique("someones-agent");
    await jang.registerAgent({ agentId, ownerId: "own_a_real_person" });
    expect(await playHouseSide(unique("sess"), agentId)).toBe(false);
  });

  it("refuses an agent it has never heard of", async () => {
    expect(await playHouseSide(unique("sess"), unique("ghost"))).toBe(false);
  });

  it("recognises the house by its owner, not by its name", async () => {
    // Nothing stops a person naming their agent "house-something", so the
    // check has to be on who owns it.
    const impostor = unique("house-item-not-really");
    await jang.registerAgent({ agentId: impostor, ownerId: "own_a_real_person" });
    expect(await playHouseSide(unique("sess"), impostor)).toBe(false);

    const real = unique("house-genuine");
    await jang.registerAgent({ agentId: real, ownerId: HOUSE_OWNER });
    // A real house agent is accepted; it then finds no such session and
    // records the failure rather than throwing here.
    expect(await playHouseSide(unique("sess"), real)).toBe(true);
  });
});

/**
 * An agent planning a negotiation needs its own limits before it opens one.
 * HW9's cold start found it could only see them from inside a session.
 */
describe("marketItemFor and the agent's own mandate", () => {
  const itemId = "item-tv-65oled";

  it("returns the caller's own mandate and names its bounds", async () => {
    const agentId = unique("planner");
    await jang.registerAgent({ agentId, ownerId: unique("own") });
    const mandate = buyerMandate({ agentId, itemId, constraints: { price: { max: 1300 } } });
    await store.putMandate(mandate);

    const item = await marketItemFor(itemId, agentId, mandate.ownerId);
    expect(item.youHaveMandate).toBe(true);
    expect(item.yourMandate?.mandateId).toBe(mandate.mandateId);
    expect(item.yourMandate?.constraints.price).toEqual({ max: 1300 });
    expect(item.nextSteps[0]).toContain("at most 1300 USD");
  });

  it("never carries the counterparty's mandate", async () => {
    const agentId = unique("snoop");
    await jang.registerAgent({ agentId, ownerId: unique("own") });
    await store.putMandate(buyerMandate({ agentId, itemId }));

    const item = await marketItemFor(itemId, agentId, "own_snoop");
    const house = await store.getMandate(item.counterpartyAgentId!, itemId);
    expect(house).toBeDefined();
    const wire = JSON.stringify(item);
    expect(wire).not.toContain(house!.mandateId);
    expect(wire).not.toContain(house!.signature);
  });

  it("has no mandate to show before the owner lodges one", async () => {
    const agentId = unique("fresh");
    await jang.registerAgent({ agentId, ownerId: unique("own") });

    const item = await marketItemFor(itemId, agentId, "own_fresh");
    expect(item.youHaveMandate).toBe(false);
    expect(item.yourMandate).toBeUndefined();
  });
});
