/**
 * A seller with one television must not be able to promise it to two buyers.
 *
 * Supply is spent at acceptance, not at the opening of a session, so an agent
 * may keep several negotiations running and close only what its owner allowed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { JangError } from "../jang/types.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "../jang/testing.ts";
import { MemoryStore } from "../store/memory.ts";
import { JangService } from "./service.ts";

const agreeable = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

async function market(supply?: number) {
  const store = new MemoryStore();
  const jang = new JangService(store);

  const seller = sellerMandate({ agentId: "seller", supply });
  await store.putMandate(seller);
  await jang.registerAgent({ agentId: "seller", ownerId: "owner-seller" });

  const openWith = async (buyerId: string) => {
    await jang.registerAgent({ agentId: buyerId, ownerId: `owner-${buyerId}` });
    await store.putMandate(buyerMandate({ agentId: buyerId }));
    const view = await jang.openSession({
      agentId: "seller",
      counterpartyAgentId: buyerId,
      itemSpec: testItemSpec,
    });
    await jang.makeOffer({ agentId: "seller", sessionId: view.sessionId, terms: agreeable });
    return view.sessionId;
  };

  return { store, jang, openWith };
}

async function expectRefusal(fn: () => Promise<unknown>, code: string) {
  await expect(fn()).rejects.toMatchObject({ code });
}

describe("supply", () => {
  let fixture: Awaited<ReturnType<typeof market>>;

  describe("a seller with one to sell", () => {
    beforeEach(async () => {
      fixture = await market();
    });

    it("may close one deal", async () => {
      const session = await fixture.openWith("buyer-a");
      const { agreement } = await fixture.jang.accept({ agentId: "buyer-a", sessionId: session });
      expect(agreement.terms).toEqual(agreeable);
    });

    it("may hold a second negotiation open at the same time", async () => {
      await fixture.openWith("buyer-a");
      // Opening costs nothing: only closing spends the supply.
      const second = await fixture.openWith("buyer-b");
      expect(second).toBeTruthy();
    });

    it("cannot close a second deal, and says why", async () => {
      const first = await fixture.openWith("buyer-a");
      const second = await fixture.openWith("buyer-b");
      await fixture.jang.accept({ agentId: "buyer-a", sessionId: first });

      await expectRefusal(
        () => fixture.jang.accept({ agentId: "buyer-b", sessionId: second }),
        "SUPPLY_EXHAUSTED",
      );
    });

    it("leaves the losing session open rather than killing it", async () => {
      const first = await fixture.openWith("buyer-a");
      const second = await fixture.openWith("buyer-b");
      await fixture.jang.accept({ agentId: "buyer-a", sessionId: first });
      await fixture.jang.accept({ agentId: "buyer-b", sessionId: second }).catch(() => {});

      expect((await fixture.store.getSession(second))?.status).toBe("open");
    });

    it("records the refusal for the operator", async () => {
      const first = await fixture.openWith("buyer-a");
      const second = await fixture.openWith("buyer-b");
      await fixture.jang.accept({ agentId: "buyer-a", sessionId: first });
      await fixture.jang.accept({ agentId: "buyer-b", sessionId: second }).catch(() => {});

      const events = await fixture.store.listEvents({ sessionId: second });
      expect(events.some((e) => e.code === "SUPPLY_EXHAUSTED")).toBe(true);
    });
  });

  describe("a seller with three to sell", () => {
    it("closes three and refuses the fourth", async () => {
      const { jang, openWith } = await market(3);
      for (const buyer of ["b1", "b2", "b3"]) {
        const session = await openWith(buyer);
        await jang.accept({ agentId: buyer, sessionId: session });
      }
      const fourth = await openWith("b4");
      await expectRefusal(() => jang.accept({ agentId: "b4", sessionId: fourth }), "SUPPLY_EXHAUSTED");
    });
  });

  describe("what an agent is told about the contest", () => {
    it("counts what is left and how many rivals are negotiating", async () => {
      const { jang, openWith } = await market(2);
      await openWith("b1");
      await openWith("b2");
      await openWith("b3");

      const before = await jang.marketFor("seller", testItemSpec.itemId);
      expect(before).toMatchObject({ authorised: 2, remaining: 2, openSessions: 3 });
    });

    it("counts down as deals close", async () => {
      const { jang, openWith } = await market(2);
      const first = await openWith("b1");
      await openWith("b2");
      await jang.accept({ agentId: "b1", sessionId: first });

      expect(await jang.marketFor("seller", testItemSpec.itemId)).toMatchObject({
        remaining: 1,
        openSessions: 1,
      });
    });

    it("tells a buyer about its own allowance, never the seller's", async () => {
      const { jang, openWith } = await market(5);
      await openWith("b1");
      // The buyer's own mandate carries no supply, so one is its allowance.
      expect(await jang.marketFor("b1", testItemSpec.itemId)).toMatchObject({ authorised: 1 });
    });
  });

  describe("a buyer's own allowance", () => {
    it("stops one buyer committing to two of the same thing", async () => {
      const store = new MemoryStore();
      const jang = new JangService(store);
      await jang.registerAgent({ agentId: "buyer", ownerId: "owner-buyer" });
      await store.putMandate(buyerMandate({ agentId: "buyer" }));

      for (const sellerId of ["s1", "s2"]) {
        await jang.registerAgent({ agentId: sellerId, ownerId: `owner-${sellerId}` });
        await store.putMandate(sellerMandate({ agentId: sellerId, supply: 10 }));
      }

      const sessions: string[] = [];
      for (const sellerId of ["s1", "s2"]) {
        const view = await jang.openSession({
          agentId: sellerId,
          counterpartyAgentId: "buyer",
          itemSpec: testItemSpec,
        });
        await jang.makeOffer({ agentId: sellerId, sessionId: view.sessionId, terms: agreeable });
        sessions.push(view.sessionId);
      }

      await jang.accept({ agentId: "buyer", sessionId: sessions[0] });
      await expectRefusal(
        () => jang.accept({ agentId: "buyer", sessionId: sessions[1] }),
        "SUPPLY_EXHAUSTED",
      );
    });
  });
});

describe("the refusal", () => {
  it("is a JangError the API turns into a 409", async () => {
    const { jang, openWith } = await market();
    const first = await openWith("x1");
    const second = await openWith("x2");
    await jang.accept({ agentId: "x1", sessionId: first });

    await expect(jang.accept({ agentId: "x2", sessionId: second })).rejects.toBeInstanceOf(JangError);
  });
});
