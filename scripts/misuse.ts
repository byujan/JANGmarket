#!/usr/bin/env tsx
/**
 * Misuse tests: an agent trying to act outside the authority it was given.
 *
 * Every probe goes through the same MCP interface a well-behaved agent uses,
 * so these are refusals by JANG rather than by the client.
 */
import { McpAgent } from "../agents/mcp-agent.ts";
import { JangClient } from "../src/lib/client.ts";
import { provision } from "../src/lib/demo/provision.ts";
import { BASE_URL, colour, ensureServer, loadScenario } from "./common.ts";

const c = colour;
const scenario = loadScenario();

type Probe = { name: string; expectation: string; passed: boolean; observed: string };
const probes: Probe[] = [];

function record(name: string, expectation: string, passed: boolean, observed: string): void {
  probes.push({ name, expectation, passed, observed });
  console.log(`${passed ? `${c.green}BLOCKED${c.reset}` : `${c.red}LEAKED ${c.reset}`}  ${name}`);
  console.log(`         ${c.dim}expected: ${expectation}${c.reset}`);
  console.log(`         ${c.dim}observed: ${observed.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" · ")}${c.reset}\n`);
}

const server = await ensureServer();
try {
  const suffix = `-misuse-${Date.now().toString(36)}`;
  const setup = await provision(scenario, BASE_URL, suffix);

  const seller = new McpAgent("seller", { apiUrl: BASE_URL, apiKey: setup.seller.apiKey, sessionId: setup.sessionId });
  const buyer = new McpAgent("buyer", { apiUrl: BASE_URL, apiKey: setup.buyer.apiKey, sessionId: setup.sessionId });
  await Promise.all([seller.connect(), buyer.connect()]);

  console.log(`\n${c.bold}Probing the limits of delegated authority${c.reset}`);
  console.log(`${c.dim}seller floor $1,180 · buyer ceiling $1,500 · neither agent is told the other's figure${c.reset}\n`);

  // 1. The seller's own agent tries to sell below the floor its owner set.
  const belowFloor = await seller.callRaw("offer", {
    terms: { price: 1100, deliveryDays: 10, warrantyMonths: 12, bundle: 0 },
    note: "Desperate to clear stock.",
  });
  record(
    "the seller's agent offers $1,100, below its owner's $1,180 floor",
    "MANDATE_VIOLATION naming the price limit",
    belowFloor.isError && belowFloor.text.includes("MANDATE_VIOLATION") && belowFloor.text.includes("1180"),
    belowFloor.text,
  );

  // 2. The session must survive a refusal: a blocked agent can still negotiate.
  const legal = await seller.callRaw("offer", {
    terms: { price: 1400, deliveryDays: 10, warrantyMonths: 12, bundle: 0 },
    note: "Here is what I can actually do.",
  });
  record(
    "the session stays open and usable after the refusal",
    "the next, lawful offer is accepted",
    !legal.isError,
    legal.isError ? legal.text : "offer accepted, negotiation continues",
  );

  // 3. The buyer's agent tries to accept a package above its owner's ceiling.
  //    Turn order has to be respected to get there: the buyer counters lawfully,
  //    then the seller asks $1,600 — lawful for the seller, impossible for the buyer.
  await buyer.callRaw("counter", {
    terms: { price: 1200, deliveryDays: 5, warrantyMonths: 36, bundle: 1 },
    note: "This is the shape of deal I am looking for.",
  });
  const sellerAsk = await seller.callRaw("counter", {
    terms: { price: 1600, deliveryDays: 10, warrantyMonths: 12, bundle: 0 },
    note: "Final price.",
  });
  if (sellerAsk.isError) {
    console.log(`${c.red}setup problem: the seller's $1,600 ask was itself refused — ${sellerAsk.text.split("\n")[0]}${c.reset}`);
  }
  const overCeiling = await buyer.callRaw("accept", {});
  record(
    "the buyer's agent accepts a $1,600 package over its owner's $1,500 ceiling",
    "MANDATE_VIOLATION naming the price limit",
    overCeiling.isError && overCeiling.text.includes("MANDATE_VIOLATION") && overCeiling.text.includes("1500"),
    overCeiling.text,
  );

  // 4. A stranger with a valid JANG account tries to act in someone else's session.
  const intruderClient = new JangClient(BASE_URL);
  const intruderKey = await intruderClient.registerAgent({ agentId: `agent-intruder${suffix}`, ownerId: "owner-mallory" });
  const intruder = new McpAgent("intruder", { apiUrl: BASE_URL, apiKey: intruderKey, sessionId: setup.sessionId });
  await intruder.connect();
  const peek = await intruder.callRaw("get_session", {});
  record(
    "an unrelated registered agent reads someone else's session",
    "NOT_A_PARTICIPANT, and no terms disclosed",
    peek.isError && peek.text.includes("NOT_A_PARTICIPANT"),
    peek.text,
  );

  // 5. The privacy claim itself: what the buyer can see must not contain the
  //    seller's mandate, which holds the floor the seller is bargaining over.
  const view = await buyer.callRaw("get_session", {});
  const sellerSecrets = setup.seller.mandate;
  const leaks = [sellerSecrets.mandateId, sellerSecrets.signature, "1180"].filter((needle) => view.text.includes(needle));
  record(
    "the buyer's view of the session carries the seller's mandate",
    "no mandate id, signature or floor price anywhere in the payload",
    leaks.length === 0,
    leaks.length === 0 ? "nothing from the seller's mandate appears in the buyer's view" : `leaked: ${leaks.join(", ")}`,
  );

  await Promise.all([seller.close(), buyer.close(), intruder.close()]);

  const failed = probes.filter((probe) => !probe.passed);
  console.log(
    failed.length === 0
      ? `${c.green}${c.bold}All ${probes.length} probes were refused or contained as intended.${c.reset}\n`
      : `${c.red}${c.bold}${failed.length} of ${probes.length} probes got through.${c.reset}\n`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  server.stop();
}
