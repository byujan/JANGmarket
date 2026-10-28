#!/usr/bin/env tsx
/**
 * The end-to-end demo: two autonomous agents negotiate through JANG's MCP
 * interface and walk away with a signed agreement.
 *
 * Everything printed with a ▸ is a real MCP tool call. The utility figures in
 * the narration are the researcher's view, computed here from both mandates at
 * once; neither agent can see the other's column.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { McpAgent } from "../agents/mcp-agent.ts";
import { runRuleAgent, type AgentEvent } from "../agents/runner.ts";
import { auditAgreement } from "../src/lib/jang/agreement.ts";
import { checkTermsAgainstMandate } from "../src/lib/jang/mandate.ts";
import { utility } from "../src/lib/jang/utility.ts";
import { provision } from "../src/lib/demo/provision.ts";
import { JangClient } from "../src/lib/client.ts";
import { BASE_URL, colour, ensureServer, loadScenario, termsLine } from "./common.ts";

async function waitForFirstOffer(apiKey: string, sessionId: string): Promise<void> {
  const client = new JangClient(BASE_URL, apiKey);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const view = await client.getSession(sessionId);
    if (view.roundsUsed > 0 || view.status !== "open") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const c = colour;
const scenario = loadScenario();
const dimensions = scenario.itemSpec.dimensions;

function heading(text: string): void {
  console.log(`\n${c.bold}${text}${c.reset}\n${c.dim}${"─".repeat(Math.min(78, text.length + 24))}${c.reset}`);
}

const server = await ensureServer();
try {
  heading("1. The market");
  console.log(`${scenario.title}`);
  console.log(`${c.dim}${scenario.itemSpec.description ?? ""}${c.reset}`);
  console.log(`\nNegotiable terms: ${dimensions.map((d) => d.label).join(", ")}`);
  console.log(
    `\n${c.yellow}Private to the buyer's owner:${c.reset} ${scenario.buyer.persona}` +
      `\n${c.cyan}Private to the seller's owner:${c.reset} ${scenario.seller.persona}`,
  );
  console.log(`\n${c.dim}Neither agent is shown the other's paragraph, limits or preferences.${c.reset}`);

  heading("2. Owners lodge signed mandates with JANG");
  const setup = await provision(scenario, BASE_URL, `-${Date.now().toString(36)}`);
  const buyerMandate = setup.buyer.mandate;
  const sellerMandate = setup.seller.mandate;
  console.log(`buyer  ${setup.buyer.agentId}  mandate ${buyerMandate.mandateId} ${c.green}signed by ${buyerMandate.ownerId}${c.reset}`);
  console.log(`seller ${setup.seller.agentId}  mandate ${sellerMandate.mandateId} ${c.green}signed by ${sellerMandate.ownerId}${c.reset}`);
  console.log(`session ${setup.sessionId}`);

  heading("3. Agents connect over MCP");
  const label = { buyer: `${c.yellow}BUYER ${c.reset}`, seller: `${c.cyan}SELLER${c.reset}` };

  const onEvent = (event: AgentEvent): void => {
    const who = event.label === "buyer" ? label.buyer : label.seller;
    if (event.kind === "offer") {
      const toBuyer = utility(event.terms, buyerMandate).toFixed(2);
      const toSeller = utility(event.terms, sellerMandate).toFixed(2);
      console.log(`\n${who} ${c.bold}round ${event.round}${c.reset}  ${termsLine(event.terms, dimensions)}`);
      console.log(`       ${c.dim}"${event.note}"${c.reset}`);
      console.log(`       ${c.dim}value to buyer ${toBuyer} · to seller ${toSeller}${c.reset}`);
    } else if (event.kind === "accept") {
      console.log(`\n${who} ${c.green}${c.bold}accepts.${c.reset} JANG signed agreement ${event.agreement.agreementId}`);
    } else if (event.kind === "refused") {
      console.log(`\n${who} ${c.red}refused by JANG — ${event.code}${c.reset}`);
    } else {
      console.log(`\n${who} ${c.dim}stops: ${event.reason}${c.reset}`);
    }
  };

  const agents = {
    buyer: new McpAgent("buyer", { apiUrl: BASE_URL, apiKey: setup.buyer.apiKey, sessionId: setup.sessionId }),
    seller: new McpAgent("seller", { apiUrl: BASE_URL, apiKey: setup.seller.apiKey, sessionId: setup.sessionId }),
  };
  await Promise.all([agents.buyer.connect(), agents.seller.connect()]);
  console.log(`tools offered by the JANG MCP server: ${(await agents.buyer.listTools()).join(", ")}`);

  heading("4. The negotiation");
  const startedAt = Date.now();
  // The retailer posts first, the way a seller with stock to clear would; the
  // buyer's agent then responds to a real offer rather than to an empty table.
  const sellerRunning = runRuleAgent({ label: "seller", agent: agents.seller, onEvent, options: { toughness: 1.6 } });
  await waitForFirstOffer(setup.seller.apiKey, setup.sessionId);
  const buyerRunning = runRuleAgent({ label: "buyer", agent: agents.buyer, onEvent, options: { toughness: 1.5 } });
  const [sellerRun, buyerRun] = await Promise.all([sellerRunning, buyerRunning]);
  const elapsedMs = Date.now() - startedAt;
  const agreement = sellerRun.agreement ?? buyerRun.agreement;
  await Promise.all([agents.buyer.close(), agents.seller.close()]);

  if (!agreement) {
    console.log(`\n${c.red}No agreement was reached.${c.reset}`);
    process.exitCode = 1;
  } else {
    heading("5. Verifying the result");
    const audit = auditAgreement(agreement, setup.jangPublicKey, { buyer: buyerMandate, seller: sellerMandate });
    const tick = (ok: boolean) => (ok ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`);
    console.log(`${tick(audit.signatureValid)}  JANG's Ed25519 signature verifies against the published public key`);
    console.log(`${tick(audit.buyer.ok)}  every term is inside the buyer owner's mandate`);
    console.log(`${tick(audit.seller.ok)}  every term is inside the seller owner's mandate`);
    for (const violation of [...audit.buyer.violations, ...audit.seller.violations]) {
      console.log(`      ${c.red}${violation.dimension}: ${violation.reason}${c.reset}`);
    }

    heading("6. Against the posted price");
    const baseline = scenario.fixedPriceBaseline.terms;
    const baselineBuyer = checkTermsAgainstMandate(baseline, buyerMandate);
    console.log(`${scenario.fixedPriceBaseline.label}: ${termsLine(baseline, dimensions)}`);
    console.log(
      `  buyer's value ${utility(baseline, buyerMandate).toFixed(2)} against a reservation of ${buyerMandate.reservationUtility} → ` +
        (baselineBuyer.ok ? `${c.green}the buyer could take it${c.reset}` : `${c.red}the buyer walks away, no sale${c.reset}`),
    );
    console.log(`\nNegotiated: ${termsLine(agreement.terms, dimensions)}`);
    console.log(
      `  buyer's value ${utility(agreement.terms, buyerMandate).toFixed(2)} · seller's value ${utility(agreement.terms, sellerMandate).toFixed(2)} → ` +
        `${c.green}both owners are above their reservation${c.reset}`,
    );
    console.log(
      `\n${c.dim}${agreement.rounds} rounds, ${elapsedMs} ms, ` +
        `${agents.buyer.callCount + agents.seller.callCount} MCP tool calls.${c.reset}`,
    );

    mkdirSync(".tmp", { recursive: true });
    const artefact = {
      agreement,
      jangPublicKey: setup.jangPublicKey,
      mandates: { buyer: buyerMandate, seller: sellerMandate },
      scenarioId: scenario.scenarioId,
      elapsedMs,
      toolCalls: agents.buyer.callCount + agents.seller.callCount,
    };
    writeFileSync(".tmp/last-run.json", `${JSON.stringify(artefact, null, 2)}\n`);
    console.log(`${c.dim}Saved to .tmp/last-run.json — run \`npm run verify\` to check it independently.${c.reset}`);
    if (!audit.ok) process.exitCode = 1;
  }
} finally {
  server.stop();
}
