/**
 * One suite, both implementations. The Postgres pass only runs when
 * DATABASE_URL is set, so the default `npm test` stays dependency-free, but
 * the two stores are held to exactly the same contract.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signAgreement, buildAgreementBody } from "../jang/agreement.ts";
import { generateKeyPair } from "../jang/crypto.ts";
import { acceptStandingOffer, createSession, submitOffer } from "../jang/session.ts";
import { buyerMandate, sellerMandate, testItemSpec } from "../jang/testing.ts";
import type { Session } from "../jang/types.ts";
import { MemoryStore } from "./memory.ts";
import { PostgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

const agreeable = { price: 1280, deliveryDays: 20, warrantyMonths: 24, bundle: 0 };

function freshSession(sessionId = "sess-store"): Session {
  return createSession({
    sessionId,
    itemSpec: testItemSpec,
    buyerAgentId: "agent-buyer",
    sellerAgentId: "agent-seller",
    mandates: [buyerMandate(), sellerMandate()],
  });
}

const candidates: { name: string; make: () => Store; cleanup?: () => Promise<void> }[] = [
  { name: "MemoryStore", make: () => new MemoryStore() },
];

/*
 * The Postgres pass needs its own database, named separately from
 * DATABASE_URL. The suite truncates between tests, so pointing it at a
 * development database destroys that database; it has happened.
 */
if (process.env.TEST_DATABASE_URL) {
  const shared = PostgresStore.fromUrl(process.env.TEST_DATABASE_URL);
  candidates.push({ name: "PostgresStore", make: () => shared });
} else if (process.env.DATABASE_URL) {
  console.warn(
    "\n  Skipping the Postgres store suite. It truncates between tests, so it\n" +
      "  needs TEST_DATABASE_URL pointing at a throwaway database, not DATABASE_URL.\n" +
      "  Create one with:  createdb jang_test\n",
  );
}

for (const candidate of candidates) {
  describe(candidate.name, () => {
    let store: Store;

    beforeEach(async () => {
      store = candidate.make();
      await store.reset();
    });

    afterAll(async () => {
      await candidate.cleanup?.();
    });

    it("round-trips an owner and finds it by Clerk id", async () => {
      const owner = {
        ownerId: "own_1",
        clerkUserId: "user_abc",
        email: "dana@example.com",
        displayName: "Dana",
        publicKey: "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n",
        createdAt: new Date().toISOString(),
      };
      await store.upsertOwner(owner);
      expect(await store.getOwnerByClerkId("user_abc")).toMatchObject({ ownerId: "own_1", email: "dana@example.com" });
      // Upserting again must update rather than duplicate or throw.
      await store.upsertOwner({ ...owner, displayName: "Dana J" });
      expect((await store.getOwner("own_1"))?.displayName).toBe("Dana J");
    });

    it("survives the same owner being created twice at once", async () => {
      // A page and its layout both resolve the signed-in owner, so the first
      // visit really does race two inserts of the same row.
      const owner = {
        ownerId: "own_race",
        clerkUserId: "user_race",
        email: "race@example.com",
        createdAt: new Date().toISOString(),
      };
      await Promise.all([store.upsertOwner(owner), store.upsertOwner(owner), store.upsertOwner(owner)]);
      expect((await store.getOwnerByClerkId("user_race"))?.ownerId).toBe("own_race");
    });

    it("keeps a public key once bound, even when later upserts omit it", async () => {
      const owner = {
        ownerId: "own_key",
        clerkUserId: "user_key",
        email: "key@example.com",
        createdAt: new Date().toISOString(),
      };
      await store.upsertOwner({ ...owner, publicKey: "PEM-A" });
      await store.upsertOwner(owner);
      expect((await store.getOwner("own_key"))?.publicKey).toBe("PEM-A");
    });

    it("finds an agent by its hashed key and lists an owner's agents", async () => {
      const base = { ownerId: "own_1", createdAt: new Date().toISOString() };
      await store.createAgent({ ...base, agentId: "a1", apiKeyHash: "hash-1", label: "buyer bot" });
      await store.createAgent({ ...base, agentId: "a2", apiKeyHash: "hash-2" });
      await store.createAgent({ ...base, ownerId: "own_2", agentId: "a3", apiKeyHash: "hash-3" });

      expect((await store.getAgentByApiKeyHash("hash-2"))?.agentId).toBe("a2");
      expect(await store.getAgentByApiKeyHash("nope")).toBeUndefined();
      expect((await store.listAgentsByOwner("own_1")).map((a) => a.agentId).sort()).toEqual(["a1", "a2"]);
    });

    it("keeps one mandate per agent and item, replacing on re-lodge", async () => {
      const first = buyerMandate();
      await store.putMandate(first);
      const replacement = { ...first, mandateId: "mandate-replaced" };
      await store.putMandate(replacement);

      const stored = await store.getMandate(first.agentId, first.itemId);
      expect(stored?.mandateId).toBe("mandate-replaced");
      expect(await store.listMandatesByOwner(first.ownerId)).toHaveLength(1);
    });

    it("persists a session with its offers and reads it back intact", async () => {
      const opened = freshSession();
      await store.putSession(opened);
      const withOffer = submitOffer(opened, "agent-seller", agreeable, { offerId: "o1" }).session;
      await store.putSession(withOffer);

      const loaded = await store.getSession(opened.sessionId);
      expect(loaded?.offers).toHaveLength(1);
      expect(loaded?.offers[0]).toMatchObject({ offerId: "o1", fromAgentId: "agent-seller", round: 1 });
      expect(loaded?.offers[0].terms).toEqual(agreeable);
      // The mandates must survive the round trip, or authority checks break.
      expect(loaded?.mandates["agent-buyer"].signature).toBe(opened.mandates["agent-buyer"].signature);
    });

    it("keeps an offer's alternatives, in order, across a round trip", async () => {
      const opened = freshSession();
      const alternatives = [
        { offerId: "o1-b", terms: { ...agreeable, price: 1250, deliveryDays: 28 } },
        { offerId: "o1-c", terms: { ...agreeable, price: 1300, warrantyMonths: 12 } },
      ];
      const withOffer = submitOffer(opened, "agent-seller", agreeable, { offerId: "o1", alternatives }).session;
      await store.putSession(withOffer);
      const loaded = await store.getSession(withOffer.sessionId);
      expect(loaded?.offers[0].alternatives).toEqual(alternatives);
    });

    it("appends offers without duplicating the ones already stored", async () => {
      let session = freshSession();
      await store.putSession(session);
      session = submitOffer(session, "agent-seller", agreeable, { offerId: "o1" }).session;
      await store.putSession(session);
      session = submitOffer(session, "agent-buyer", agreeable, { offerId: "o2" }).session;
      await store.putSession(session);
      // Re-saving the same state must be idempotent.
      await store.putSession(session);

      expect((await store.getSession(session.sessionId))?.offers.map((o) => o.offerId)).toEqual(["o1", "o2"]);
    });

    it("records an agreement and closes the session", async () => {
      let session = freshSession();
      session = submitOffer(session, "agent-seller", agreeable, { offerId: "o1" }).session;
      const accepted = acceptStandingOffer(session, "agent-buyer");
      const keys = generateKeyPair();
      const agreement = signAgreement(
        buildAgreementBody({
          agreementId: "agr-1",
          session: accepted.session,
          offer: accepted.offer,
          acceptedByAgentId: "agent-buyer",
        }),
        keys.privateKeyPem,
        keys.publicKeyPem,
      );
      await store.putSession({ ...accepted.session, agreementId: agreement.agreementId });
      await store.putAgreement(agreement);

      expect((await store.getAgreement("agr-1"))?.signature).toBe(agreement.signature);
      const reloaded = await store.getSession(session.sessionId);
      expect(reloaded?.status).toBe("agreed");
      expect(reloaded?.agreementId).toBe("agr-1");
      expect(reloaded?.acceptedBy).toMatchObject({ agentId: "agent-buyer", offerId: "o1" });
    });

    it("lists sessions, newest first, and filters by participant", async () => {
      await store.putSession(freshSession("sess-a"));
      const other = createSession({
        sessionId: "sess-b",
        itemSpec: testItemSpec,
        buyerAgentId: "agent-buyer",
        sellerAgentId: "agent-seller",
        mandates: [buyerMandate(), sellerMandate()],
      });
      await store.putSession(other);

      const all = await store.listSessions();
      expect(all.map((s) => s.sessionId).sort()).toEqual(["sess-a", "sess-b"]);
      expect(all[0]).toMatchObject({ status: "open", itemId: testItemSpec.itemId, rounds: 0 });

      expect(await store.listSessions({ agentIds: ["agent-buyer"] })).toHaveLength(2);
      expect(await store.listSessions({ agentIds: ["agent-nobody"] })).toHaveLength(0);
      expect(await store.listSessions({ status: "agreed" })).toHaveLength(0);
    });

    it("counts every session, not just the page a listing returned", async () => {
      // The operator board shows a page of rows; its totals must not be
      // derived from that page, or they silently under-report.
      for (let i = 0; i < 5; i += 1) await store.putSession(freshSession(`sess-count-${i}`));
      let closed = freshSession("sess-count-closed");
      closed = submitOffer(closed, "agent-seller", agreeable, { offerId: "oc" }).session;
      await store.putSession(acceptStandingOffer(closed, "agent-buyer").session);

      expect(await store.countSessions()).toMatchObject({ open: 5, agreed: 1, total: 6 });
      // A short page must not change the totals.
      expect(await store.listSessions({ limit: 2 })).toHaveLength(2);
      expect((await store.countSessions()).total).toBe(6);
      expect(await store.countSessions({ agentIds: ["agent-nobody"] })).toMatchObject({ total: 0 });
    });

    it("reports what one agent has committed and how contested its item is", async () => {
      // Opening sessions costs nothing; only a closed one is committed.
      await store.putSession(freshSession("sess-m1"));
      await store.putSession(freshSession("sess-m2"));
      let closed = freshSession("sess-m3");
      closed = submitOffer(closed, "agent-seller", agreeable, { offerId: "om" }).session;
      await store.putSession(acceptStandingOffer(closed, "agent-buyer").session);

      expect(await store.marketState("agent-seller", testItemSpec.itemId)).toEqual({
        committed: 1,
        openSessions: 2,
      });
      // An agent with nothing on this item sees an empty market.
      expect(await store.marketState("agent-nobody", testItemSpec.itemId)).toEqual({
        committed: 0,
        openSessions: 0,
      });
      // And nothing leaks across items.
      expect(await store.marketState("agent-seller", "item-that-does-not-exist")).toEqual({
        committed: 0,
        openSessions: 0,
      });
    });

    it("counts events by kind across all of them", async () => {
      const at = new Date().toISOString();
      for (let i = 0; i < 4; i += 1) {
        await store.recordEvent({ kind: "refusal", code: "MANDATE_VIOLATION", createdAt: at });
      }
      await store.recordEvent({ kind: "agreed", createdAt: at });

      expect(await store.countEvents({ kind: "refusal" })).toBe(4);
      expect(await store.countEvents()).toBe(5);
      expect(await store.listEvents({ limit: 2 })).toHaveLength(2);
      expect(await store.countEvents({ kind: "refusal" })).toBe(4);
    });

    it("keeps refusals for the operator view, newest first", async () => {
      await store.recordEvent({
        kind: "refusal",
        sessionId: "sess-a",
        agentId: "agent-seller",
        code: "MANDATE_VIOLATION",
        message: "below the minimum allowed",
        detail: { dimension: "price", limit: 1180 },
        createdAt: new Date(Date.now() - 1000).toISOString(),
      });
      await store.recordEvent({ kind: "agreed", sessionId: "sess-a", createdAt: new Date().toISOString() });

      const events = await store.listEvents({ sessionId: "sess-a" });
      expect(events.map((e) => e.kind)).toEqual(["agreed", "refusal"]);
      expect(events[1].detail).toMatchObject({ dimension: "price", limit: 1180 });
      expect(await store.listEvents({ sessionId: "sess-other" })).toHaveLength(0);
    });
  });
}
