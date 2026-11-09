#!/usr/bin/env tsx
/**
 * Final project, Claude agents: the product before the four final changes
 * against the product with all four, on the same markets.
 *
 *   before  MESO hidden from the tools, no priority disclosure, and each
 *           owner's mandate exactly as the market defines it (the old builder
 *           let an owner type the numbers in).
 *   all4    MESO available (93f940c), both owners disclose their priority
 *           order (d1577a1), and each mandate is what the new builder
 *           (198ed59) would produce: weights from the owner's priority order
 *           by rank-order centroid, and the reservation value of an outside
 *           offer that is worth exactly the true reservation to the owner.
 *   meso+disclose  MESO and disclosure, with the true mandates: separates the
 *           negotiation changes from the builder change.
 *           The frontier and operator checks (df904bf, 6d936aa) run server
 *           side in both arms and are never shown to agents.
 *
 * Every deal is scored against the TRUE market, so an elicited mandate that
 * misstates what an owner wants shows up as a worse deal (or one below the
 * owner's true reservation).
 *
 *   npx tsx scripts/final/llm-all.ts --markets=4 [--concurrency=3] [--cases=ordinary,narrow,asymmetric] [--dry]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runLlmAgent, type LlmRunResult } from "../../agents/llm-strategy.ts";
import { JangClient } from "../../src/lib/client.ts";
import { reservationFromAlternative, weightsFromRanking } from "../../src/lib/jang/elicit.ts";
import { issueMandate, type Party, type Scenario } from "../../src/lib/jang/scenario.ts";
import type { Terms } from "../../src/lib/jang/types.ts";
import { utility } from "../../src/lib/jang/utility.ts";
import { provision } from "../../src/lib/demo/provision.ts";
import { BASE_URL, ensureServer, loadScenario } from "../common.ts";
import { groundTruth, makeMarket, mulberry32, quality, type CaseName } from "../hw7/lib.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const K = Number(arg("markets", "4"));
const seed = Number(arg("seed", "20261101"));
const concurrency = Number(arg("concurrency", "3"));
const cases = arg("cases", "ordinary,narrow,asymmetric").split(",") as CaseName[];
type Arm = "before" | "meso+disclose" | "all4";
const arms = arg("arms", "before,meso+disclose,all4").split(",") as Arm[];
const maxTurns = Number(arg("max-turns", "80"));
const model = process.env.JANG_LLM_MODEL;
const dry = process.argv.includes("--dry");

const BUYER =
  "You buy a clearance 65-inch OLED TV for a household. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const SELLER =
  "You clear last season's 65-inch OLED stock for a retailer. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const STUBBORN =
  " Your owner has told you to be extremely stubborn: hold your opening position and make only token concessions until the last two rounds.";

// ---------------------------------------------------------------- what the new builder produces
/** The party as the new mandate builder would lodge it for this owner. */
function elicited(party: Party, market: Scenario, rand: () => number): { party: Party; batna: Terms } {
  const order = Object.entries(party.preferences)
    .sort(([ka, a], [kb, b]) => b.weight - a.weight || (ka < kb ? -1 : 1))
    .map(([k]) => k);
  const w = weightsFromRanking(order);
  const preferences = Object.fromEntries(Object.entries(party.preferences).map(([k, p]) => [k, { ...p, weight: w[k] }]));

  // The owner's outside offer: a package worth their true reservation to them.
  const steps = (k: string) => {
    const p = party.preferences[k];
    const step = market.itemSpec.dimensions.find((d) => d.key === k)?.step ?? 1;
    const values = new Set<number>();
    for (let i = 0; i <= 7; i += 1) values.add(Math.round((p.worst + ((p.ideal - p.worst) * i) / 7) / step) * step);
    return [...values];
  };
  const keys = Object.keys(party.preferences);
  let grid: Terms[] = [{}];
  for (const k of keys) grid = grid.flatMap((t) => steps(k).map((v) => ({ ...t, [k]: v })));
  const scored = grid.map((t) => ({ t, gap: Math.abs(utility(t, { preferences: party.preferences }) - party.reservationUtility) }));
  const close = scored.filter((s) => s.gap < 0.01);
  const pool = close.length ? close : [scored.reduce((a, b) => (b.gap < a.gap ? b : a))];
  const batna = pool[Math.floor(rand() * pool.length)].t;
  return { party: { ...party, preferences, reservationUtility: reservationFromAlternative(batna, preferences) }, batna };
}

// ---------------------------------------------------------------- plan
const base = loadScenario();

// --feasibility: no Claude calls. Over every feasible market of each case and
// 20 outside offers per owner, how often do the new builder's mandates leave
// no possible deal? Splits the cause: ROC weights alone (true reservation
// number kept) vs the full builder (ROC weights + reservation from the offer).
if (process.argv.includes("--feasibility")) {
  for (const kind of cases) {
    let markets = 0, rocOnly = 0, full = 0, draws = 0;
    for (let index = 0; index < 200; index += 1) {
      const truth = makeMarket(base, kind, seed, index);
      if (!groundTruth(issueMandate(truth, "buyer"), issueMandate(truth, "seller"), truth).feasible.length) continue;
      markets += 1;
      const rand = mulberry32(seed + index);
      const feasible = (m: Scenario) => groundTruth(issueMandate(m, "buyer"), issueMandate(m, "seller"), m).feasible.length > 0;
      const b0 = elicited(truth.buyer, truth, rand), s0 = elicited(truth.seller, truth, rand);
      if (!feasible({ ...truth, buyer: { ...b0.party, reservationUtility: truth.buyer.reservationUtility }, seller: { ...s0.party, reservationUtility: truth.seller.reservationUtility } })) rocOnly += 1;
      for (let d = 0; d < 20; d += 1) {
        draws += 1;
        if (!feasible({ ...truth, buyer: elicited(truth.buyer, truth, rand).party, seller: elicited(truth.seller, truth, rand).party })) full += 1;
      }
    }
    console.log(`${kind.padEnd(10)} ${markets} feasible markets: no deal left with ROC weights only ${rocOnly}/${markets} (${((100 * rocOnly) / markets).toFixed(0)}%), with the full new builder ${full}/${draws} draws (${((100 * full) / draws).toFixed(0)}%)`);
  }
  process.exit(0);
}
type Job = { kind: CaseName; index: number; truth: Scenario; arm: Arm };
const jobs: Job[] = [];
const markets: { kind: CaseName; index: number; truth: Scenario }[] = [];
for (const kind of cases) {
  let found = 0;
  for (let index = 0; found < K && index < 200; index += 1) {
    const truth = makeMarket(base, kind, seed, index);
    if (!groundTruth(issueMandate(truth, "buyer"), issueMandate(truth, "seller"), truth).feasible.length) continue;
    markets.push({ kind, index, truth });
    found += 1;
  }
}
for (const m of markets) for (const arm of arms) jobs.push({ ...m, arm });

function marketFor(job: Job): { market: Scenario; batnas?: Record<string, Terms> } {
  if (job.arm === "before") return { market: job.truth };
  if (job.arm === "meso+disclose")
    return { market: { ...job.truth, buyer: { ...job.truth.buyer, disclosePriorities: true }, seller: { ...job.truth.seller, disclosePriorities: true } } };
  const rand = mulberry32(seed * 7 + job.index * 131 + job.kind.length);
  const b = elicited(job.truth.buyer, job.truth, rand);
  const s = elicited(job.truth.seller, job.truth, rand);
  return {
    market: { ...job.truth, buyer: { ...b.party, disclosePriorities: true }, seller: { ...s.party, disclosePriorities: true } },
    batnas: { buyer: b.batna, seller: s.batna },
  };
}

console.log(`Final, Claude agents: ${markets.length} markets x ${arms.join("/")} = ${jobs.length} negotiations, seed ${seed}, model ${model ?? "(llm-strategy default)"}`);
for (const m of markets) {
  const e = marketFor({ ...m, arm: "all4" }).market;
  const feasibleAfter = groundTruth(issueMandate(e, "buyer"), issueMandate(e, "seller"), e).feasible.length > 0;
  console.log(
    `  ${m.kind.padEnd(10)} #${m.index}  r buyer ${m.truth.buyer.reservationUtility} -> ${e.buyer.reservationUtility}, seller ${m.truth.seller.reservationUtility} -> ${e.seller.reservationUtility}${feasibleAfter ? "" : "  (no deal possible under the elicited mandates)"}`,
  );
}
if (dry) process.exit(0);

// ---------------------------------------------------------------- run
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("results/final", { recursive: true });
const file = `results/final/llm-all-${stamp}.json`;
const records: any[] = [];

async function runJob(job: Job) {
  const { market, batnas } = marketFor(job);
  const setup = await provision(market, BASE_URL, `-final-${stamp}-${job.kind}-${job.index}-${job.arm}`);
  const env: Record<string, string> = job.arm === "before" ? { JANG_MESO: "off" } : {};
  const started = Date.now();
  const settled = await Promise.allSettled([
    runLlmAgent({ role: "seller", persona: SELLER + (job.kind === "asymmetric" ? STUBBORN : ""), apiUrl: BASE_URL, apiKey: setup.seller.apiKey, sessionId: setup.sessionId, model, maxTurns, env }),
    runLlmAgent({ role: "buyer", persona: BUYER, apiUrl: BASE_URL, apiKey: setup.buyer.apiKey, sessionId: setup.sessionId, model, maxTurns, env }),
  ]);
  const runs: LlmRunResult[] = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const errors = [
    ...settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : [])),
    ...runs.flatMap((r) => (r.error ? [`${r.label}: ${r.error}`] : [])),
  ];
  const view = await new JangClient(BASE_URL, setup.buyer.apiKey).getSession(setup.sessionId);
  const trueBuyer = issueMandate(job.truth, "buyer");
  const trueSeller = issueMandate(job.truth, "seller");
  const truth = groundTruth(trueBuyer, trueSeller, job.truth);
  const lodged = groundTruth(setup.buyer.mandate, setup.seller.mandate, market);
  let terms: Terms | undefined;
  let q: ReturnType<typeof quality> | undefined;
  if (view.status === "agreed" && view.agreementId) {
    terms = (await new JangClient(BASE_URL).getAgreement(view.agreementId)).terms;
    q = quality(terms, trueBuyer, trueSeller, truth);
  }
  const cost = runs.reduce((a, r) => a + (r.usage?.costUsd ?? 0), 0);
  const record = {
    case: job.kind,
    marketIndex: job.index,
    arm: job.arm,
    agreed: !!terms,
    status: view.status,
    rounds: view.roundsUsed,
    terms,
    quality: q,
    // Under the TRUE mandates: would either owner rather have walked away?
    belowTrueReservation: q ? { buyer: q.buyerValue < trueBuyer.reservationUtility - 1e-9, seller: q.sellerValue < trueSeller.reservationUtility - 1e-9 } : undefined,
    feasibleTrue: truth.feasible.length > 0,
    feasibleLodged: lodged.feasible.length > 0,
    lodgedReservation: { buyer: setup.buyer.mandate.reservationUtility, seller: setup.seller.mandate.reservationUtility },
    trueReservation: { buyer: trueBuyer.reservationUtility, seller: trueSeller.reservationUtility },
    batnas,
    mesoOffers: view.offers.filter((o) => o.alternatives?.length).length,
    acceptedAlternative: terms ? !view.offers.some((o) => JSON.stringify(o.terms) === JSON.stringify(terms)) : undefined,
    seconds: (Date.now() - started) / 1000,
    apiEquivalentUsd: Number(cost.toFixed(4)),
    error: errors.length ? errors.join(" | ") : undefined,
  };
  records.push(record);
  writeFileSync(file, `${JSON.stringify({ seed, model: model ?? null, maxTurns, records }, null, 1)}\n`);
  console.log(
    `${job.kind.padEnd(10)} #${String(job.index).padEnd(3)} ${job.arm.padEnd(13)} ${record.agreed ? `AGREED eff ${q!.efficiency.toFixed(2)} buyer share ${q!.buyerShare.toFixed(2)}` : view.status.toUpperCase()} in ${view.roundsUsed} rounds, meso offers ${record.mesoOffers}, $${record.apiEquivalentUsd}${record.error ? `  error: ${record.error.slice(0, 160)}` : ""}`,
  );
}

const server = await ensureServer();
try {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          await runJob(job);
        } catch (e) {
          console.log(`${job.kind} #${job.index} ${job.arm}: FAILED ${e}`);
        }
      }
    }),
  );
} finally {
  server.stop();
}
console.log(`\nwrote ${file}`);
