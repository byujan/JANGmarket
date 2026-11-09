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
 *   all4+money  all4 with the builder's money questions (e4789a1): weights from
 *           what each term is worth in dollars, each answer off by a
 *           log-normal factor (sigma 0.3, so about ±30%). Same markets and
 *           same outside offers as all4, so the two differ only in the weights.
 *   all4+refit  all4+money (same dollar answers, same outside offers), then the
 *           builder's "Check a few deals" step (05baa4f): the owner answers up
 *           to three yes/no questions truthfully, and the weights are refitted
 *           with the product's own startRefit / nextCheck / answerCheck.
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
import {
  answerCheck,
  nextCheck,
  refitCandidates,
  refittedWeights,
  reservationFromAlternative,
  startRefit,
  weightsFromRanking,
  weightsFromSwings,
} from "../../src/lib/jang/elicit.ts";
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
type Arm = "before" | "meso+disclose" | "all4" | "all4+money" | "all4+refit";
const arms = arg("arms", "before,meso+disclose,all4").split(",") as Arm[];
const maxTurns = Number(arg("max-turns", "80"));
const model = process.env.JANG_LLM_MODEL;
const dry = process.argv.includes("--dry");
// --meso-guide: agents in MESO arms get the opt-in MESO prompt and session hints (JANG_MESO_GUIDE=on).
const mesoGuide = process.argv.includes("--meso-guide");
// --only=narrow:6,asymmetric:0 reruns just those markets (e.g. after a usage limit cut runs short).
const only = arg("only", "").split(",").filter(Boolean);

const BUYER =
  "You buy a clearance 65-inch OLED TV for a household. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const SELLER =
  "You clear last season's 65-inch OLED stock for a retailer. Your owner's limits and how much each term matters to them are in your mandate (yourMandate in get_session): read it and negotiate to score well under it.";
const STUBBORN =
  " Your owner has told you to be extremely stubborn: hold your opening position and make only token concessions until the last two rounds.";

// ---------------------------------------------------------------- what the new builder produces
/** How far off an owner's dollar answers are: a log-normal factor with this sigma. */
const MONEY_NOISE = Number(arg("money-noise", "0.3"));

/** The party as the new mandate builder would lodge it for this owner. */
function elicited(
  party: Party,
  market: Scenario,
  rand: () => number,
  money?: () => number,
  refit = false,
): { party: Party; batna: Terms; swings?: Record<string, number>; checks?: { terms: Terms; wouldTake: boolean }[] } {
  const order = Object.entries(party.preferences)
    .sort(([ka, a], [kb, b]) => b.weight - a.weight || (ka < kb ? -1 : 1))
    .map(([k]) => k);
  let w = weightsFromRanking(order);
  let swings: Record<string, number> | undefined;
  if (money) {
    // What each term is worth in dollars to this owner, limit to best, as they would roughly say it.
    const price = party.preferences.price;
    const range = Math.abs(price.ideal - price.worst);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - money())) * Math.cos(2 * Math.PI * money());
    swings = Object.fromEntries(
      Object.entries(party.preferences)
        .filter(([k]) => k !== "price")
        .map(([k, p]) => [k, Math.round((p.weight / price.weight) * range * Math.exp(MONEY_NOISE * gauss()))]),
    );
    const anchors = Object.fromEntries(Object.entries(party.preferences).map(([k, p]) => [k, { ideal: p.ideal, limit: p.worst }]));
    w = weightsFromSwings("price", swings, anchors) ?? w;
  }
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
  if (!refit) return { party: { ...party, preferences, reservationUtility: reservationFromAlternative(batna, preferences) }, batna, swings };

  // "Check a few deals", as the builder runs it: the owner answers from their TRUE preferences.
  const anchors = Object.fromEntries(
    keys.map((k) => [k, { ideal: party.preferences[k].ideal, limit: party.preferences[k].worst, step: market.itemSpec.dimensions.find((d) => d.key === k)?.step ?? 1 }]),
  );
  const prefs = Object.fromEntries(keys.map((k) => [k, { ideal: party.preferences[k].ideal, worst: party.preferences[k].worst }]));
  const candidates = refitCandidates(anchors);
  const trueValueOfAlternative = utility(batna, { preferences: party.preferences });
  let state = startRefit(w, order);
  const checks: { terms: Terms; wouldTake: boolean }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const pkg = nextCheck(state, candidates, batna, prefs);
    if (!pkg) break;
    const wouldTake = utility(pkg, { preferences: party.preferences }) >= trueValueOfAlternative;
    checks.push({ terms: pkg, wouldTake });
    state = answerCheck(state, pkg, batna, prefs, wouldTake);
  }
  const fitted = state.answered > 0 ? refittedWeights(state) : w;
  const refitted = Object.fromEntries(Object.entries(party.preferences).map(([k, p]) => [k, { ...p, weight: fitted[k] }]));
  return { party: { ...party, preferences: refitted, reservationUtility: reservationFromAlternative(batna, refitted) }, batna, swings, checks };
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
for (const m of markets) {
  if (only.length && !only.includes(`${m.kind}:${m.index}`)) continue;
  for (const arm of arms) jobs.push({ ...m, arm });
}

function marketFor(job: Job): { market: Scenario; batnas?: Record<string, Terms>; swings?: Record<string, Record<string, number> | undefined>; checks?: Record<string, unknown> } {
  if (job.arm === "before") return { market: job.truth };
  if (job.arm === "meso+disclose")
    return { market: { ...job.truth, buyer: { ...job.truth.buyer, disclosePriorities: true }, seller: { ...job.truth.seller, disclosePriorities: true } } };
  // Same stream as all4 for the outside offers; a separate one for the dollar answers.
  const rand = mulberry32(seed * 7 + job.index * 131 + job.kind.length);
  // all4+refit reuses all4+money's dollar answers, so the two arms differ only by the checks.
  const money = job.arm === "all4+money" || job.arm === "all4+refit" ? mulberry32(seed * 13 + job.index * 977 + job.kind.length) : undefined;
  const refit = job.arm === "all4+refit";
  const b = elicited(job.truth.buyer, job.truth, rand, money, refit);
  const s = elicited(job.truth.seller, job.truth, rand, money, refit);
  return {
    market: { ...job.truth, buyer: { ...b.party, disclosePriorities: true }, seller: { ...s.party, disclosePriorities: true } },
    batnas: { buyer: b.batna, seller: s.batna },
    ...(b.swings ? { swings: { buyer: b.swings, seller: s.swings } } : {}),
    ...(b.checks ? { checks: { buyer: b.checks, seller: s.checks } } : {}),
  };
}

console.log(`Final, Claude agents: ${markets.length} markets x ${arms.join("/")} = ${jobs.length} negotiations, seed ${seed}, model ${model ?? "(llm-strategy default)"}`);
for (const m of markets) {
  const ok = (arm: Arm) => {
    const e = marketFor({ ...m, arm }).market;
    return groundTruth(issueMandate(e, "buyer"), issueMandate(e, "seller"), e).feasible.length > 0 ? "deal possible" : "NO DEAL POSSIBLE";
  };
  console.log(`  ${m.kind.padEnd(10)} #${String(m.index).padEnd(3)} all4: ${ok("all4").padEnd(16)} all4+money: ${ok("all4+money").padEnd(16)} all4+refit: ${ok("all4+refit")}`);
}
if (dry) process.exit(0);

// ---------------------------------------------------------------- run
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("results/final", { recursive: true });
const file = `results/final/llm-all-${stamp}.json`;
const records: any[] = [];

async function runJob(job: Job) {
  const { market, batnas, swings, checks } = marketFor(job);
  const setup = await provision(market, BASE_URL, `-final-${stamp}-${job.kind}-${job.index}-${job.arm}`);
  const env: Record<string, string> = job.arm === "before" ? { JANG_MESO: "off" } : mesoGuide ? { JANG_MESO_GUIDE: "on" } : {};
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
    swings,
    checks,
    mesoOffers: view.offers.filter((o) => o.alternatives?.length).length,
    acceptedAlternative: terms ? !view.offers.some((o) => JSON.stringify(o.terms) === JSON.stringify(terms)) : undefined,
    seconds: (Date.now() - started) / 1000,
    apiEquivalentUsd: Number(cost.toFixed(4)),
    error: errors.length ? errors.join(" | ") : undefined,
  };
  records.push(record);
  writeFileSync(file, `${JSON.stringify({ seed, model: model ?? null, maxTurns, mesoGuide, records }, null, 1)}\n`);
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
