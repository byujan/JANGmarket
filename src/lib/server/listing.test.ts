/**
 * Listing something, then negotiating over it: the whole path, without a
 * browser.
 *
 * The listing carries only what is public — the terms and their ranges. The
 * lister's own limits are a separate, signed mandate, and the counterparty is
 * derived from the item alone.
 */
import { describe, expect, it } from "vitest";
import { generateKeyPair } from "../jang/crypto.ts";
import { houseMandateBody } from "../jang/listing.ts";
import { signMandate } from "../jang/mandate.ts";
import type { Dimension } from "../jang/types.ts";
import type { ItemRecord } from "../store/types.ts";
import { MemoryStore } from "../store/memory.ts";
import { JangService } from "./service.ts";

const dimensions: Dimension[] = [
  { key: "price", label: "Price", unit: "USD", min: 0, max: 1000, step: 10, buyerPrefers: "low" },
  { key: "pickupDays", label: "Pickup", unit: "days", min: 1, max: 30, step: 1, buyerPrefers: "low" },
];

const listing: ItemRecord = {
  itemId: "item_bike",
  ownerId: "own_someone",
  title: "Road bike, barely used",
  listedRole: "seller",
  dimensions,
  createdAt: new Date().toISOString(),
};

function houseFor(item: ItemRecord) {
  const keys = generateKeyPair();
  return signMandate(
    houseMandateBody({
      itemSpec: { itemId: item.itemId, title: item.title, dimensions: item.dimensions },
      listedRole: item.listedRole,
      agentId: "house",
      ownerId: "jang-house",
      mandateId: "mdt_house_bike",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      supply: 100,
    }),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("negotiating over something somebody listed", () => {
  it("runs from a listing with terms nobody wrote a scenario for", async () => {
    const store = new MemoryStore();
    const jang = new JangService(store);
    await store.putItem(listing);

    // The house takes the open side, derived from the item's ranges.
    await jang.registerAgent({ agentId: "house", ownerId: "jang-house" });
    await store.putMandate(houseFor(listing));

    // The lister signs their own limits, privately, like any other owner.
    await jang.registerAgent({ agentId: "seller-agent", ownerId: listing.ownerId });
    const keys = generateKeyPair();
    await store.putMandate(
      signMandate(
        {
          mandateId: "mdt_listed",
          agentId: "seller-agent",
          ownerId: listing.ownerId,
          role: "seller",
          itemId: listing.itemId,
          constraints: { price: { min: 300 }, pickupDays: { max: 21 } },
          preferences: {
            price: { weight: 4, ideal: 900, worst: 300 },
            pickupDays: { weight: 1, ideal: 21, worst: 1 },
          },
          reservationUtility: 0.25,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        keys.privateKeyPem,
        keys.publicKeyPem,
      ),
    );

    const view = await jang.openSession({
      agentId: "seller-agent",
      counterpartyAgentId: "house",
      itemSpec: { itemId: listing.itemId, title: listing.title, dimensions },
    });
    expect(view.sessionId).toBeTruthy();

    // A package inside both positions closes, and is signed.
    await jang.makeOffer({
      agentId: "seller-agent",
      sessionId: view.sessionId,
      terms: { price: 500, pickupDays: 14 },
    });
    const { agreement } = await jang.accept({ agentId: "house", sessionId: view.sessionId });
    expect(agreement.terms).toEqual({ price: 500, pickupDays: 14 });
  });

  it("gives the house a position of its own, so a greedy listing is refused", async () => {
    const store = new MemoryStore();
    const jang = new JangService(store);
    await store.putItem(listing);
    await jang.registerAgent({ agentId: "house", ownerId: "jang-house" });
    await store.putMandate(houseFor(listing));

    await jang.registerAgent({ agentId: "seller-agent", ownerId: listing.ownerId });
    const keys = generateKeyPair();
    await store.putMandate(
      signMandate(
        {
          mandateId: "mdt_greedy",
          agentId: "seller-agent",
          ownerId: listing.ownerId,
          role: "seller",
          itemId: listing.itemId,
          constraints: {},
          preferences: {
            price: { weight: 4, ideal: 1000, worst: 0 },
            pickupDays: { weight: 1, ideal: 30, worst: 1 },
          },
          reservationUtility: 0,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        keys.privateKeyPem,
        keys.publicKeyPem,
      ),
    );

    const view = await jang.openSession({
      agentId: "seller-agent",
      counterpartyAgentId: "house",
      itemSpec: { itemId: listing.itemId, title: listing.title, dimensions },
    });
    // Top of the range on every term: the house's own ceiling refuses it.
    await jang.makeOffer({
      agentId: "seller-agent",
      sessionId: view.sessionId,
      terms: { price: 1000, pickupDays: 30 },
    });

    await expect(jang.accept({ agentId: "house", sessionId: view.sessionId })).rejects.toMatchObject({
      code: "MANDATE_VIOLATION",
    });
  });
});
