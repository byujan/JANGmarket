#!/usr/bin/env tsx
/**
 * Fill a signed-in owner's console with real negotiations.
 *
 * Everything the console shows is scoped to the agents an owner holds, so a
 * fresh account sees empty panels however much has happened on the instance.
 * This registers agents against a real owner, lodges a signed mandate for each,
 * opens a session per market and lets both sides negotiate to a conclusion.
 *
 * Nothing here is faked: the offers are made through the ordinary service, the
 * mandates are signed and enforced, and the agreements are the ones JANG
 * issued. Two of the sessions are run by Claude rather than by the rule-based
 * agent, so the transcripts carry real reasoning and notes.
 *
 *   npm run seed -- --owner=own_user_xxx [--llm=2]
 *
 * The owner id is the one in the owners table; it is the Clerk user id with an
 * `own_` prefix.
 */
import { runLlmAgent } from "../agents/llm-strategy.ts";
import { runRuleAgent } from "../agents/runner.ts";
import { ServicePort } from "../agents/service-port.ts";
import { issueMandate, type Scenario } from "../src/lib/jang/scenario.ts";
import type { Role } from "../src/lib/jang/types.ts";
import { jang } from "../src/lib/server/service.ts";
import { store } from "../src/lib/store/index.ts";
import { BASE_URL, colour as c, ensureServer, loadScenario, termsLine } from "./common.ts";

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const ownerId = arg("owner");
if (!ownerId) {
  console.error("usage: npm run seed -- --owner=own_user_xxx [--llm=<how many Claude negotiates>]");
  process.exit(1);
}
/**
 * Which side the owner takes in each market. Mixing the roles matters: the
 * console draws buying and selling differently, and an owner who only ever
 * buys never sees half of it.
 */
const MARKETS: { file: string; owner: Role }[] = [
  { file: "agents/scenarios/tv-clearance.json", owner: "buyer" },
  { file: "agents/scenarios/freelance-contract.json", owner: "seller" },
  { file: "agents/scenarios/cambridge-rental.json", owner: "buyer" },
  { file: "agents/scenarios/datacentre-power.json", owner: "buyer" },
];

/**
 * How many markets Claude negotiates, taken from the top of the list. The
 * rule-based agent writes its notes from a template, so a console seeded with
 * it reads as machinery rather than bargaining: Claude does all of them unless
 * you ask for fewer.
 */
const llmBudget = Number(arg("llm") ?? MARKETS.length);

const opposite = (role: Role): Role => (role === "buyer" ? "seller" : "buyer");
const stamp = Date.now().toString(36);

/**
 * Register both agents and lodge both mandates for one market.
 *
 * The owner's side is re-issued under their own owner id, so the agent really
 * belongs to them; the other side stays with the market's own owner, which is
 * what makes it a counterparty rather than the owner talking to themselves.
 */
async function setUp(scenario: Scenario, ownerRole: Role) {
  const side = async (role: Role) => {
    const party = role === "buyer" ? scenario.buyer : scenario.seller;
    const mine = role === ownerRole;
    const agentId = `${mine ? "yours" : "house"}-${scenario.scenarioId}-${role}-${stamp}`;
    const asOwner = mine ? ownerId! : party.ownerId;
    const { apiKey } = await jang.registerAgent({
      agentId,
      ownerId: asOwner,
      label: `${role} · ${scenario.title}`,
    });
    // The agent id and owner are inside the signed body, so the mandate is
    // issued with the final values rather than patched afterwards, which would
    // break the signature.
    const patched = { ...scenario, [role]: { ...party, agentId, ownerId: asOwner } } as Scenario;
    await store.putMandate(issueMandate(patched, role));
    return { role, agentId, apiKey };
  };

  const buyer = await side("buyer");
  const seller = await side("seller");
  const view = await jang.openSession({
    agentId: seller.agentId,
    counterpartyAgentId: buyer.agentId,
    itemSpec: scenario.itemSpec,
    maxRounds: scenario.maxRounds,
    ttlSeconds: 3600,
  });
  return { buyer, seller, sessionId: view.sessionId };
}

const server = await ensureServer();
try {
  const owner = await store.getOwner(ownerId);
  if (!owner) throw new Error(`no owner ${ownerId}; sign in once so the account exists`);
  console.log(`\n${c.bold}Seeding the console for ${owner.email ?? ownerId}${c.reset}`);
  console.log(`${c.dim}${MARKETS.length} markets, ${llmBudget} of them negotiated by Claude${c.reset}\n`);

  let llmLeft = llmBudget;
  for (const market of MARKETS) {
    const scenario = loadScenario(market.file);
    const { buyer, seller, sessionId } = await setUp(scenario, market.owner);
    const byClaude = llmLeft > 0;
    if (byClaude) llmLeft -= 1;

    const you = market.owner === "buyer" ? buyer : seller;
    console.log(
      `${c.bold}${scenario.title}${c.reset}\n` +
        `${c.dim}you are the ${market.owner} (${you.agentId}); ` +
        `${byClaude ? "Claude is negotiating" : "rule-based agents"}${c.reset}`,
    );

    const started = Date.now();
    if (byClaude) {
      // Over the API, because that is the path a real agent takes: the MCP
      // server is a client of the same REST endpoints.
      await Promise.all(
        (["seller", "buyer"] as Role[]).map((role) => {
          const party = role === "buyer" ? scenario.buyer : scenario.seller;
          const agent = role === "buyer" ? buyer : seller;
          return runLlmAgent({
            role,
            persona: party.persona,
            apiUrl: BASE_URL,
            apiKey: agent.apiKey,
            sessionId,
            onEvent: (event) => {
              if (event.kind !== "tool") return;
              const input = event.input as { terms?: Record<string, number>; note?: string };
              if ((event.tool === "offer" || event.tool === "counter") && !input?.terms) return;
              const tint = role === "buyer" ? c.yellow : c.cyan;
              const terms = input?.terms ? `  ${termsLine(input.terms, scenario.itemSpec.dimensions)}` : "";
              console.log(`  ${tint}${role.padEnd(6)}${c.reset} ${event.tool}${terms}`);
            },
          });
        }),
      );
    } else {
      await Promise.all(
        [seller, buyer].map((agent) =>
          runRuleAgent({
            label: agent.role,
            agent: new ServicePort(jang, agent.agentId, sessionId),
            options: { toughness: agent.role === "seller" ? 1.6 : 1.5, respectBounds: true },
            pollMs: 25,
          }),
        ),
      );
    }

    const done = await store.getSession(sessionId);
    const agreement = done?.agreementId ? await store.getAgreement(done.agreementId) : undefined;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (agreement) {
      console.log(
        `  ${c.green}agreed${c.reset} ${termsLine(agreement.terms, scenario.itemSpec.dimensions)}` +
          ` ${c.dim}· ${done!.offers.length} offers · ${seconds}s${c.reset}\n`,
      );
    } else {
      console.log(`  ${c.red}${done?.status ?? "missing"}${c.reset} ${c.dim}after ${seconds}s${c.reset}\n`);
    }
  }

  const agents = await store.listAgentsByOwner(ownerId);
  const mandates = await store.listMandatesByOwner(ownerId);
  const sessions = await store.listSessions({ agentIds: agents.map((a) => a.agentId), limit: 100 });
  console.log(
    `${c.bold}Console now holds${c.reset} ${agents.length} agents · ${mandates.length} signed limits · ` +
      `${sessions.length} negotiations ${c.dim}(${sessions.filter((s) => s.status === "agreed").length} agreed)${c.reset}\n`,
  );
} finally {
  server.stop();
  process.exit(0);
}
