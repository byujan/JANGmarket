#!/usr/bin/env tsx
/**
 * Several buyers, one seller, fewer units than buyers.
 *
 * Each buyer negotiates its own session against the same seller agent, all at
 * once. The seller's mandate authorises a quantity, and JANG refuses any
 * acceptance past it, so the losing buyers find out by being refused rather
 * than by everyone being promised the same television.
 *
 *   npm run market -- --buyers=4 --supply=2
 */
import { runRuleAgent } from "../agents/runner.ts";
import { ServicePort } from "../agents/service-port.ts";
import { JangClient } from "../src/lib/client.ts";
import { issueMandate } from "../src/lib/jang/scenario.ts";
import { jang } from "../src/lib/server/service.ts";
import { store } from "../src/lib/store/index.ts";
import { BASE_URL, colour, ensureServer, loadScenario, termsLine } from "./common.ts";

const c = colour;
const scenario = loadScenario();
const arg = (name: string, fallback: number) =>
  Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);

const buyerCount = Math.max(2, arg("buyers", 4));
const supply = Math.max(1, arg("supply", 2));
const stamp = Date.now().toString(36);

const server = await ensureServer();
try {
  console.log(`\n${c.bold}${scenario.title}${c.reset}`);
  console.log(
    `${c.dim}${buyerCount} buyers, ${supply} to sell. Every buyer negotiates its own session against the same seller, at the same time.${c.reset}\n`,
  );

  // One seller, authorised for a limited quantity.
  const sellerId = `market-seller-${stamp}`;
  await new JangClient(BASE_URL).health();
  await jang.registerAgent({ agentId: sellerId, ownerId: scenario.seller.ownerId });
  // Supply lives inside the signed body, so it goes in before signing: adding
  // it afterwards invalidates the owner's signature, as it should.
  await store.putMandate(
    issueMandate({ ...scenario, seller: { ...scenario.seller, agentId: sellerId, supply } }, "seller"),
  );

  // Each buyer gets its own agent, mandate and session.
  const buyers = await Promise.all(
    Array.from({ length: buyerCount }, async (_, i) => {
      const agentId = `market-buyer-${stamp}-${i + 1}`;
      await jang.registerAgent({ agentId, ownerId: `${scenario.buyer.ownerId}-${i + 1}` });
      await store.putMandate(issueMandate({ ...scenario, buyer: { ...scenario.buyer, agentId } }, "buyer"));
      const view = await jang.openSession({
        agentId: sellerId,
        counterpartyAgentId: agentId,
        itemSpec: scenario.itemSpec,
        maxRounds: scenario.maxRounds,
      });
      return { agentId, sessionId: view.sessionId, label: `buyer ${i + 1}` };
    }),
  );

  console.log(`${c.dim}opened ${buyers.length} sessions; the seller may close ${supply}${c.reset}\n`);

  const started = Date.now();
  await Promise.all(
    buyers.flatMap((buyer) => [
      runRuleAgent({
        label: `seller:${buyer.label}`,
        agent: new ServicePort(jang, sellerId, buyer.sessionId),
        options: { toughness: 1.6, respectBounds: true },
        pollMs: 25,
      }),
      runRuleAgent({
        label: buyer.label,
        agent: new ServicePort(jang, buyer.agentId, buyer.sessionId),
        options: { toughness: 1.5, respectBounds: true },
        pollMs: 25,
      }),
    ]),
  );
  const elapsed = Date.now() - started;

  console.log(`${c.bold}Outcome${c.reset}`);
  let won = 0;
  for (const buyer of buyers) {
    const session = await store.getSession(buyer.sessionId);
    const agreement = session?.agreementId ? await store.getAgreement(session.agreementId) : undefined;
    const refusals = (await store.listEvents({ sessionId: buyer.sessionId, limit: 50 })).filter(
      (event) => event.code === "SUPPLY_EXHAUSTED",
    );

    if (agreement) {
      won += 1;
      console.log(
        `  ${c.green}${buyer.label} closed${c.reset}  ${termsLine(agreement.terms, scenario.itemSpec.dimensions)}`,
      );
    } else if (refusals.length > 0) {
      console.log(
        `  ${c.red}${buyer.label} lost the item${c.reset}  ${c.dim}reached terms, then SUPPLY_EXHAUSTED: the seller had none left${c.reset}`,
      );
    } else {
      console.log(`  ${c.dim}${buyer.label} did not reach terms (${session?.status})${c.reset}`);
    }
  }

  const market = await jang.marketFor(sellerId, scenario.itemSpec.itemId);
  console.log(
    `\n${c.dim}${won} of ${buyerCount} buyers closed; the seller committed ${market.authorised - market.remaining} of ${market.authorised}. ${elapsed} ms.${c.reset}`,
  );

  const oversold = won > supply;
  console.log(
    oversold
      ? `${c.red}${c.bold}Oversold: more deals than units.${c.reset}\n`
      : `${c.green}Nothing was sold twice.${c.reset}\n`,
  );
  process.exitCode = oversold ? 1 : 0;
} finally {
  server.stop();
}
