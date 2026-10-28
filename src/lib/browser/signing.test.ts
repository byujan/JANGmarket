/**
 * The round trip that matters: a key made with WebCrypto, a signature made in
 * the browser's style, and a verification done by the server's node:crypto
 * path. If the PEM framing, the JWK import or the canonical JSON disagree by
 * one byte, this fails.
 */
import { describe, expect, it } from "vitest";
import { verifyMandate } from "../jang/mandate.ts";
import type { Mandate, MandateBody } from "../jang/types.ts";
import { createOwnerKey, signMandateBody } from "./signing.ts";

const body: MandateBody = {
  mandateId: "mdt_browser_1",
  agentId: "agent-buyer",
  ownerId: "own_user_123",
  role: "buyer",
  itemId: "item-tv-65oled",
  constraints: { price: { max: 1500 } },
  preferences: { price: { weight: 5, ideal: 900, worst: 1500 } },
  reservationUtility: 0.3,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

describe("owner keys held in the browser", () => {
  it("produces a signature the server verifies", async () => {
    const key = await createOwnerKey();
    const mandate: Mandate = { ...body, ownerPublicKey: key.publicKeyPem, signature: await signMandateBody(body, key) };
    expect(verifyMandate(mandate)).toBe(true);
  });

  it("exports a public key in PEM, which is what the verifier reads", async () => {
    const key = await createOwnerKey();
    expect(key.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(key.publicKeyPem).toMatch(/-----END PUBLIC KEY-----\n$/);
  });

  it("fails verification if the body is altered after signing", async () => {
    const key = await createOwnerKey();
    const signature = await signMandateBody(body, key);
    const tampered: Mandate = {
      ...body,
      constraints: { price: { max: 9000 } },
      ownerPublicKey: key.publicKeyPem,
      signature,
    };
    expect(verifyMandate(tampered)).toBe(false);
  });

  it("will not verify under a different owner's key", async () => {
    const mine = await createOwnerKey();
    const theirs = await createOwnerKey();
    const mandate: Mandate = { ...body, ownerPublicKey: theirs.publicKeyPem, signature: await signMandateBody(body, mine) };
    expect(verifyMandate(mandate)).toBe(false);
  });
});
