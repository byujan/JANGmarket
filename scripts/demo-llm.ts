#!/usr/bin/env tsx
/**
 * The same negotiation, run by two Claude agents instead of two rule-based
 * ones. Same MCP server, same mandates, same enforcement; only the reasoning
 * changes, which is the point: JANG does not care how an agent decides, only
 * that it stays inside the authority it was given.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { runLlmAgent, type LlmEvent } from "../agents/llm-strategy.ts";
import { JangClient } from "../src/lib/client.ts";
import { auditAgreement } from "../src/lib/jang/agreement.ts";
import { utility } from "../src/lib/jang/utility.ts";
import { provision } from "../src/lib/demo/provision.ts";
import { BASE_URL, colour, ensureServer, loadScenario, termsLine } from "./common.ts";

const c = colour;
const scenario = loadScenario();
const dimensions = scenario.itemSpec.dimensions;
const tint = { buyer: c.yellow, seller: c.cyan };

const server = await ensureServer();
try {
  const setup = await provision(scenario, BASE_URL, `-llm-${Date.now().toString(36)}`);
  console.log(`\n${c.bold}${scenario.title}${c.reset}`);
  console.log(`${c.dim}Two Claude agents, each holding only its own owner's mandate.${c.reset}`);
  console.log(`${c.yellow}buyer${c.reset}  ${setup.buyer.agentId}\n${c.cyan}seller${c.reset} ${setup.seller.agentId}`);
  console.log(`session ${setup.sessionId}\n`);

  const onEvent = (event: LlmEvent): void => {
    const colourFor = tint[event.label as "buyer" | "seller"] ?? "";
    const who = `${colourFor}${event.label.toUpperCase().padEnd(6)}${c.reset}`;
    if (event.kind === "tool") {
      const args = event.input as { terms?: Record<string, number>; note?: string };
      // The SDK surfaces a tool_use block before its arguments have finished
      // streaming; the empty one would print a second, blank line.
      if ((event.tool === "offer" || event.tool === "counter") && !args?.terms) return;
      const detail = args?.terms ? `  ${termsLine(args.terms, dimensions)}` : "";
      console.log(`${who} ${c.bold}▸ ${event.tool}${c.reset}${detail}`);
      if (args?.note) console.log(`       ${c.dim}"${args.note}"${c.reset}`);
    } else if (event.kind === "thinking") {
      const line = event.text.split("\n").find((part) => part.trim()) ?? "";
      if (line) console.log(`${who} ${c.dim}${line.slice(0, 150)}${c.reset}`);
    }
  };

  const startedAt = Date.now();
  const results = await Promise.all([
    runLlmAgent({
      role: "seller",
      persona: scenario.seller.persona,
      apiUrl: BASE_URL,
      apiKey: setup.seller.apiKey,
      sessionId: setup.sessionId,
      onEvent,
    }),
    runLlmAgent({
      role: "buyer",
      persona: scenario.buyer.persona,
      apiUrl: BASE_URL,
      apiKey: setup.buyer.apiKey,
      sessionId: setup.sessionId,
      onEvent,
    }),
  ]);
  const elapsedMs = Date.now() - startedAt;

  const view = await new JangClient(BASE_URL, setup.buyer.apiKey).getSession(setup.sessionId);
  if (view.status !== "agreed" || !view.agreementId) {
    console.log(`\n${c.red}The agents did not reach an agreement; the session is ${view.status}.${c.reset}`);
    process.exitCode = 1;
  } else {
    const agreement = await new JangClient(BASE_URL).getAgreement(view.agreementId);
    const audit = auditAgreement(agreement, setup.jangPublicKey, {
      buyer: setup.buyer.mandate,
      seller: setup.seller.mandate,
    });
    const tick = (ok: boolean) => (ok ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`);

    console.log(`\n${c.bold}Agreed:${c.reset} ${termsLine(agreement.terms, dimensions)}`);
    console.log(`${tick(audit.signatureValid)}  JANG's signature verifies`);
    console.log(`${tick(audit.buyer.ok)}  inside the buyer's mandate`);
    console.log(`${tick(audit.seller.ok)}  inside the seller's mandate`);
    console.log(
      `${c.dim}buyer value ${utility(agreement.terms, setup.buyer.mandate).toFixed(2)} · ` +
        `seller value ${utility(agreement.terms, setup.seller.mandate).toFixed(2)} · ` +
        `${agreement.rounds} rounds · ${(elapsedMs / 1000).toFixed(1)}s · ` +
        `${results.reduce((sum, run) => sum + run.toolCalls, 0)} MCP tool calls${c.reset}`,
    );

    mkdirSync(".tmp", { recursive: true });
    writeFileSync(
      ".tmp/last-run.json",
      `${JSON.stringify(
        { agreement, jangPublicKey: setup.jangPublicKey, mandates: { buyer: setup.buyer.mandate, seller: setup.seller.mandate }, elapsedMs },
        null,
        2,
      )}\n`,
    );
    console.log(`${c.dim}Saved to .tmp/last-run.json. Run \`npm run verify\`.${c.reset}`);
    if (!audit.ok) process.exitCode = 1;
  }
} finally {
  server.stop();
}
