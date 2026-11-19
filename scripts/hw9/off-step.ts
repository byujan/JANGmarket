#!/usr/bin/env tsx
/**
 * HW9 boundary probe: an offer whose terms sit inside every range but off the
 * item's declared step (half a soundbar, a price in cents on a $10 grid,
 * a 13-month warranty on a 6-month grid).
 *
 * Runs through the same MCP tools a cold-start agent uses. Expected behaviour
 * after the fix: the offer is refused with INVALID_TERMS naming the term and
 * the grid, the session stays usable, and the corrected offer goes through.
 *
 *   npm run probe:off-step                 # prints a transcript
 *   npm run probe:off-step -- --json=path  # also writes the transcript as JSON
 */
import { writeFileSync } from "node:fs";
import { McpAgent } from "../../agents/mcp-agent.ts";
import { provision } from "../../src/lib/demo/provision.ts";
import { BASE_URL, colour as c, ensureServer, loadScenario } from "../common.ts";

const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length);
const scenario = loadScenario();
const grid = Object.fromEntries(scenario.itemSpec.dimensions.map((d) => [d.key, { min: d.min, max: d.max, step: d.step }]));

const offStep = { price: 1225.5, deliveryDays: 10.5, warrantyMonths: 13, bundle: 0.5 };
const onStep = { price: 1220, deliveryDays: 10, warrantyMonths: 18, bundle: 1 };

type Step = { actor: string; tool: string; args: Record<string, unknown>; isError: boolean; text: string };
const transcript: Step[] = [];

const server = await ensureServer();
try {
  const setup = await provision(scenario, BASE_URL, `-offstep-${Date.now().toString(36)}`);
  const seller = new McpAgent("seller", { apiUrl: BASE_URL, apiKey: setup.seller.apiKey, sessionId: setup.sessionId });
  const buyer = new McpAgent("buyer", { apiUrl: BASE_URL, apiKey: setup.buyer.apiKey, sessionId: setup.sessionId });
  await Promise.all([seller.connect(), buyer.connect()]);

  const call = async (actor: string, agent: McpAgent, tool: string, args: Record<string, unknown>) => {
    const result = await agent.callRaw(tool, args);
    transcript.push({ actor, tool, args, ...result });
    const head = result.text.split("\n\n")[0];
    console.log(`${result.isError ? c.red + "REFUSED " : c.green + "OK      "}${c.reset} ${actor} ${tool} ${JSON.stringify(args.terms ?? args)}`);
    console.log(`         ${c.dim}${head}${c.reset}\n`);
    return result;
  };

  console.log(`\n${c.bold}Off-step terms probe${c.reset}  ${c.dim}grid ${JSON.stringify(grid)}${c.reset}\n`);

  const first = await call("seller", seller, "offer", { terms: offStep, note: "Half a soundbar, and a price in cents." });
  let outcome: string;
  if (first.isError) {
    // After the fix: the agent reads the refusal, snaps to the grid and carries on.
    const retry = await call("seller", seller, "offer", { terms: onStep, note: "Corrected to the item's grid." });
    const accepted = retry.isError ? retry : await call("buyer", buyer, "accept", {});
    outcome = first.text.includes("INVALID_TERMS") && !retry.isError && !accepted.isError
      ? "REFUSED off-step offer with INVALID_TERMS; corrected offer accepted and signed"
      : "REFUSED off-step offer, but the recovery path did not complete";
  } else {
    // Before the fix: nothing stops the counterparty signing half a soundbar.
    const accepted = await call("buyer", buyer, "accept", {});
    const signed = accepted.isError ? null : (JSON.parse(accepted.text.slice(accepted.text.indexOf("\n\n") + 2)) as { agreement: { terms: Record<string, number> } }).agreement.terms;
    outcome = signed
      ? `ACCEPTED off-step offer; JANG signed an agreement with terms ${JSON.stringify(signed)}`
      : "ACCEPTED off-step offer; accept was refused for another reason";
  }
  await Promise.all([seller.close(), buyer.close()]);

  console.log(`${c.bold}Outcome:${c.reset} ${outcome}\n`);
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ at: new Date().toISOString(), baseUrl: BASE_URL, grid, outcome, transcript }, null, 2));
  process.exitCode = outcome.startsWith("REFUSED off-step offer with") ? 0 : 1;
} finally {
  server.stop();
}
