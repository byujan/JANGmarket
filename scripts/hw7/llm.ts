#!/usr/bin/env tsx
/**
 * HW7, Claude agents: the same comparison as run.ts on a few markets, with two
 * Claude agents (Agent SDK + the JANG MCP server) instead of the rule agents.
 *
 *   npm run hw7:llm              # 3 cases x 2 conditions x 3 repetitions = 18 negotiations
 *   npm run hw7:llm -- --reps=1  # a quick smoke run
 *   npm run hw7:llm -- --dry     # print the plan, call nothing
 *
 * Needs the JANG server (started automatically) and Claude credentials (a
 * Claude subscription login or ANTHROPIC_API_KEY). Every negotiation is saved
 * as soon as it finishes, so an interrupted run keeps what it has.
 *
 * Market selection is fixed in advance: on fresh seed 20261101, the first
 * feasible market (lowest index) of each case.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runLlmAgent, type LlmRunResult } from "../../agents/llm-strategy.ts";
import { JangClient } from "../../src/lib/client.ts";
import { auditAgreement } from "../../src/lib/jang/agreement.ts";
import { issueMandate, type Scenario } from "../../src/lib/jang/scenario.ts";
import { provision } from "../../src/lib/demo/provision.ts";
import { BASE_URL, ensureServer, loadScenario } from "../common.ts";
import { groundTruth, makeMarket, priceOnly, quality, type CaseName } from "./lib.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const reps = Number(arg("reps", "3"));
const seed = Number(arg("seed", "20261101"));
const dry = process.argv.includes("--dry");
const model = process.env.JANG_LLM_MODEL; // default: whatever llm-strategy.ts uses
// Each agent's turn budget. Waiting for the other side costs turns (get_session
// polls), so the demo's 40 is too tight for a 12-round session. Same for every
// case and condition.
const maxTurns = Number(arg("max-turns", "80"));

const base = loadScenario();

function firstFeasible(kind: CaseName): { index: number; market: Scenario } {
  for (let index = 0; index < 200; index += 1) {
    const market = makeMarket(base, kind, seed, index);
    const truth = groundTruth(issueMandate(market, "buyer"), issueMandate(market, "seller"), market);
    if (truth.feasible.length) return { index, market };
  }
  throw new Error(`no feasible ${kind} market`);
}

// The personas carry no numbers: each agent reads its own limits from its
// mandate in get_session, so the same text works for every market.
const BUYER =
  "You buy a clearance 65-inch OLED TV for a household. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const SELLER =
  "You clear last season's 65-inch OLED stock for a retailer. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const STUBBORN =
  " Your owner has told you to be extremely stubborn: hold your opening position and make only token concessions until the last two rounds.";
const PRICE_ONLY =
  " In this session only the price is negotiable. Delivery is fixed at 14 days, warranty at 12 months and there is no soundbar; every offer must use exactly those values.";

const plan: { kind: CaseName; index: number; market: Scenario }[] = [];
for (const kind of ["ordinary", "narrow"] as CaseName[]) plan.push({ kind, ...firstFeasible(kind) });
// Asymmetric = the ordinary market with a stubborn seller, as in run.ts.
plan.push({ kind: "asymmetric", index: plan[0].index, market: plan[0].market });

console.log(`HW7 Claude agents: seed ${seed}, ${reps} repetitions, ${maxTurns} turns per agent, model ${model ?? "(llm-strategy default)"}`);
for (const p of plan) console.log(`  ${p.kind.padEnd(10)} market #${p.index}  ceiling ${p.market.buyer.constraints.price?.max}  floor ${p.market.seller.constraints.price?.min}`);
if (dry) process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("results/hw7", { recursive: true });
const file = `results/hw7/llm-${stamp}.json`;
const records: unknown[] = [];

const server = await ensureServer();
try {
  for (const p of plan) {
    for (const condition of ["jang", "priceOnly"] as const) {
      const market = condition === "jang" ? p.market : priceOnly(p.market);
      for (let rep = 0; rep < reps; rep += 1) {
        const setup = await provision(market, BASE_URL, `-hw7-${stamp}-${p.kind}-${condition}-${rep}`);
        const truth = groundTruth(setup.buyer.mandate, setup.seller.mandate, market);
        const suffix = condition === "priceOnly" ? PRICE_ONLY : "";
        const started = Date.now();
        // Both agents always run to their own end, so neither is left running
        // in the background and both agents' usage is counted.
        const settled = await Promise.allSettled([
          runLlmAgent({ role: "seller", persona: SELLER + (p.kind === "asymmetric" ? STUBBORN : "") + suffix, apiUrl: BASE_URL, apiKey: setup.seller.apiKey, sessionId: setup.sessionId, model, maxTurns }),
          runLlmAgent({ role: "buyer", persona: BUYER + suffix, apiUrl: BASE_URL, apiKey: setup.buyer.apiKey, sessionId: setup.sessionId, model, maxTurns }),
        ]);
        const runs: LlmRunResult[] = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        const errors = [
          ...settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : [])),
          ...runs.flatMap((r) => (r.error ? [`${r.label}: ${r.error}`] : [])),
        ];
        const error = errors.length ? errors.join(" | ") : undefined;
        const ms = Date.now() - started;

        const view = await new JangClient(BASE_URL, setup.buyer.apiKey).getSession(setup.sessionId);
        let agreed = false;
        let terms: Record<string, number> | undefined;
        let audit: unknown;
        let q: unknown;
        if (view.status === "agreed" && view.agreementId) {
          const agreement = await new JangClient(BASE_URL).getAgreement(view.agreementId);
          audit = auditAgreement(agreement, setup.jangPublicKey, { buyer: setup.buyer.mandate, seller: setup.seller.mandate });
          agreed = true;
          terms = agreement.terms;
          // Score against the FULL market, as run.ts does for price-only deals.
          const fullBuyer = issueMandate(p.market, "buyer");
          const fullSeller = issueMandate(p.market, "seller");
          q = quality(terms, fullBuyer, fullSeller, groundTruth(fullBuyer, fullSeller, p.market));
        }
        const usage = runs.map((r) => r.usage).filter(Boolean) as NonNullable<LlmRunResult["usage"]>[];
        const sum = (k: keyof (typeof usage)[number]) => usage.reduce((a, u) => a + (u[k] as number), 0);
        const record = {
          maxTurns,
          case: p.kind,
          marketIndex: p.index,
          condition,
          rep,
          feasible: truth.feasible.length > 0,
          agreed,
          status: view.status,
          rounds: view.roundsUsed,
          terms,
          audit,
          quality: q,
          seconds: ms / 1000,
          toolCalls: runs.reduce((a, r) => a + r.toolCalls, 0),
          tokens: { input: sum("inputTokens"), output: sum("outputTokens"), cacheRead: sum("cacheReadTokens"), cacheWrite: sum("cacheWriteTokens") },
          apiEquivalentUsd: Number(sum("costUsd").toFixed(4)),
          error,
        };
        records.push(record);
        writeFileSync(file, `${JSON.stringify({ seed, reps, model: model ?? null, records }, null, 1)}\n`);
        console.log(
          `${p.kind.padEnd(10)} ${condition.padEnd(9)} rep ${rep}: ${agreed ? "AGREED" : view.status.toUpperCase()} in ${view.roundsUsed} rounds, ${(ms / 1000).toFixed(0)}s, $${record.apiEquivalentUsd}${error ? `  error: ${error}` : ""}`,
        );
      }
    }
  }
} finally {
  server.stop();
}
console.log(`\nwrote ${file}`);
