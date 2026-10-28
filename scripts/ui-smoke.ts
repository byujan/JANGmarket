#!/usr/bin/env tsx
/**
 * Exercises the path the web console takes, without a browser: create an
 * owner, register an agent, lodge a browser-signed mandate, launch a
 * negotiation against the house, and wait for it to close.
 *
 * This is the server half of the UI. The browser half is checked by eye.
 */
import { createOwnerKey, signMandateBody } from "../src/lib/browser/signing.ts";
import { verifyMandate } from "../src/lib/jang/mandate.ts";
import { auditAgreement } from "../src/lib/jang/agreement.ts";
import { catalog, launchNegotiation } from "../src/lib/server/marketplace.ts";
import { jang } from "../src/lib/server/service.ts";
import { store } from "../src/lib/store/index.ts";
import type { MandateBody } from "../src/lib/jang/types.ts";
import { colour } from "./common.ts";

const c = colour;
const stamp = Date.now().toString(36);
const ownerId = `own_smoke_${stamp}`;
const agentId = `smoke-buyer-${stamp}`;

function check(label: string, ok: boolean, detail = ""): boolean {
  console.log(`${ok ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`}  ${label}${detail ? ` ${c.dim}${detail}${c.reset}` : ""}`);
  return ok;
}

const results: boolean[] = [];

await store.upsertOwner({
  ownerId,
  clerkUserId: `user_smoke_${stamp}`,
  email: `smoke-${stamp}@example.com`,
  displayName: "Smoke Tester",
  createdAt: new Date().toISOString(),
});
results.push(check("owner row created", Boolean(await store.getOwner(ownerId))));

await jang.registerAgent({ agentId, ownerId, label: "Smoke buyer" });
results.push(check("agent registered to the owner", (await store.getAgent(agentId))?.ownerId === ownerId));

// The mandate the browser would build: a limit and an importance per term.
const scenario = catalog()[0];
const body: MandateBody = {
  mandateId: `mdt_smoke_${stamp}`,
  agentId,
  ownerId,
  role: "buyer",
  itemId: scenario.itemSpec.itemId,
  constraints: { price: { max: 1500 }, deliveryDays: { max: 30 }, warrantyMonths: { min: 0 }, bundle: { min: 0 } },
  preferences: {
    price: { weight: 5, ideal: 500, worst: 1500 },
    deliveryDays: { weight: 2, ideal: 1, worst: 30 },
    warrantyMonths: { weight: 3, ideal: 48, worst: 0 },
    bundle: { weight: 1, ideal: 1, worst: 0 },
  },
  reservationUtility: 0.3,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const key = await createOwnerKey();
const mandate = { ...body, ownerPublicKey: key.publicKeyPem, signature: await signMandateBody(body, key) };
results.push(check("browser-style signature verifies on the server", verifyMandate(mandate)));

await store.putMandate(mandate);
results.push(check("mandate lodged", Boolean(await store.getMandate(agentId, scenario.itemSpec.itemId))));

process.env.JANG_AUTOPLAY_DELAY_MS = "0";
const { sessionId } = await launchNegotiation({ ownerId, agentId, itemId: scenario.itemSpec.itemId });
results.push(check("negotiation opened against the house", Boolean(sessionId), sessionId));

// Autoplay runs in the background; wait for it to settle.
let session = await store.getSession(sessionId);
for (let attempt = 0; attempt < 120 && session?.status === "open"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  session = await store.getSession(sessionId);
}

results.push(check("the agents reached an agreement", session?.status === "agreed", `${session?.offers.length ?? 0} offers`));

if (session?.agreementId) {
  const agreement = await store.getAgreement(session.agreementId);
  const house = session.mandates[session.participants.seller];
  const audit = agreement
    ? auditAgreement(agreement, jang.publicKey, { buyer: mandate, seller: house })
    : undefined;
  results.push(check("the signed agreement audits clean against both mandates", Boolean(audit?.ok)));
}

const summaries = await store.listSessions({ agentIds: [agentId] });
results.push(check("the session is listed for this owner's agent", summaries.length === 1));

const events = await store.listEvents({ sessionId, limit: 100 });
results.push(check("events were recorded for the operator view", events.length > 0, `${events.length} events`));

const failed = results.filter((ok) => !ok).length;
console.log(
  failed === 0
    ? `\n${c.green}${c.bold}All ${results.length} console-path checks passed.${c.reset}\n`
    : `\n${c.red}${c.bold}${failed} of ${results.length} checks failed.${c.reset}\n`,
);
process.exit(failed === 0 ? 0 : 1);
