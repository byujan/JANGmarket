import { describe, expect, it } from "vitest";
import { buyerMandate, sellerMandate, testItemSpec } from "../jang/testing.ts";
import { MemoryStore } from "../store/memory.ts";
import { JangService } from "./service.ts";

describe("deal quality", () => {
  it("is recorded for the operator when a deal closes, and never in the agent's view or the agreement", async () => {
    const store = new MemoryStore();
    const service = new JangService(store);
    const buyer = buyerMandate();
    const seller = sellerMandate();
    for (const m of [buyer, seller]) {
      await service.registerAgent({ agentId: m.agentId, ownerId: m.ownerId });
      await service.lodgeMandate(m.agentId, m);
    }
    const opened = await service.openSession({ agentId: seller.agentId, counterpartyAgentId: buyer.agentId, itemSpec: testItemSpec });
    await service.makeOffer({ agentId: seller.agentId, sessionId: opened.sessionId, terms: { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 } });
    const { view, agreement } = await service.accept({ agentId: buyer.agentId, sessionId: opened.sessionId });

    const agreed = (await store.listEvents({ sessionId: opened.sessionId })).find((e) => e.kind === "agreed");
    const recorded = (agreed?.detail as { quality?: { efficiency: number; paretoDistance: number } }).quality;
    expect(recorded?.efficiency).toBeGreaterThan(0);
    expect(recorded?.efficiency).toBeLessThanOrEqual(1);
    expect(recorded?.paretoDistance).toBeGreaterThanOrEqual(0);

    expect(JSON.stringify(view)).not.toMatch(/efficien|pareto|frontier/i);
    expect(JSON.stringify(agreement)).not.toMatch(/efficien|pareto|frontier/i);
  });
});
