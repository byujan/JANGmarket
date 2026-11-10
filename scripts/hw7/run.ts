#!/usr/bin/env tsx
/**
 * HW7: JANG (multi-issue) vs price-only negotiation, posted price and oracle price.
 *
 *   tsx scripts/hw7/run.ts --seed=20261028 --variant=base
 *
 * --variant=base     the strategy as shipped in HW6
 * --variant=fix      agents accept only packages inside their own hard limits
 * --variant=option1  deadline-aware concession (same round budget)
 * --variant=option2  the shipped strategy with double the round budget
 * --variant=meso     agents put up to three equally good packages on the table per turn
 * --variant=disclose  both owners share their priority order (keys only)
 * --variant=disclose1 only the buyer shares it, to see whether the side that discloses loses out
 * Variants combine with "+", e.g. --variant=fix+option1
 * --out=results/final writes somewhere other than results/hw7 (the final-project arms)
 *
 * Writes results/hw7/<variant>-seed<seed>.json (every market, every condition)
 * and prints a summary table. Same seed + variant = same markets, same numbers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadScenario } from "../common.ts";
import {
  CASE_SIZE,
  CASES,
  TOUGHNESS,
  clears,
  groundTruth,
  makeMarket,
  negotiate,
  priceOnly,
  quality,
  type CaseName,
  type Quality,
} from "./lib.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seed = Number(arg("seed", "20261028"));
const variant = arg("variant", "base");
const parts = new Set(variant.split("+"));
const only = arg("cases", CASES.join(",")).split(",") as CaseName[];

const base = loadScenario();
const maxRounds = parts.has("option2") ? base.maxRounds * 2 : base.maxRounds;
const deadlineAware = parts.has("option1");
const respectBounds = parts.has("fix");
const meso = parts.has("meso");
const disclose = { buyer: parts.has("disclose") || parts.has("disclose1"), seller: parts.has("disclose") };
const outDir = arg("out", "results/hw7");

type Condition = { agreed: boolean; rounds?: number; apiCalls?: number; ms?: number; violations?: number; stoppedBecause?: string; q?: Quality };
type Row = {
  case: CaseName;
  index: number;
  feasible: boolean;
  feasiblePriceOnly: boolean;
  feasibleCount: number;
  jang: Condition;
  priceOnly: Condition;
  posted: Condition;
  oracle: Condition;
};

const rows: Row[] = [];
const t0 = performance.now();

for (const kind of only) {
  const toughness = TOUGHNESS[kind];
  for (let index = 0; index < CASE_SIZE[kind]; index += 1) {
    const market = makeMarket(base, kind, seed, index);
    const knobs = { ...toughness, deadlineAware, respectBounds, meso, disclose };

    const multi = await negotiate(market, knobs, maxRounds);
    const truth = groundTruth(multi.buyer, multi.seller, market);
    const q = (terms: Record<string, number> | undefined) => (terms ? quality(terms, multi.buyer, multi.seller, truth) : undefined);

    const po = await negotiate(priceOnly(market), knobs, maxRounds);
    // Price-only feasibility on the same lattice, judged by the price-only mandates.
    const poTruth = groundTruth(po.buyer, po.seller, priceOnly(market));

    const posted = market.fixedPriceBaseline.terms;
    const oracleTerms = {
      ...posted,
      price: Math.round(((market.seller.constraints.price?.min ?? 0) + (market.buyer.constraints.price?.max ?? 0)) / 2 / 10) * 10,
    };
    const postedOk = clears(posted, multi.buyer, multi.seller);
    const oracleOk = clears(oracleTerms, multi.buyer, multi.seller);

    const pick = (o: typeof multi): Condition => ({
      agreed: o.agreed,
      rounds: o.rounds,
      apiCalls: o.apiCalls,
      ms: Number(o.ms.toFixed(2)),
      violations: o.violations,
      stoppedBecause: o.stoppedBecause,
      // Price-only deals are scored against the FULL market: that is what was on the table.
      q: q(o.terms),
    });

    rows.push({
      case: kind,
      index,
      feasible: truth.feasible.length > 0,
      feasiblePriceOnly: poTruth.feasible.length > 0,
      feasibleCount: truth.feasible.length,
      jang: pick(multi),
      priceOnly: pick(po),
      posted: { agreed: postedOk, q: postedOk ? q(posted) : undefined },
      oracle: { agreed: oracleOk, q: oracleOk ? q(oracleTerms) : undefined },
    });
  }
}

const elapsedS = (performance.now() - t0) / 1000;

// ---------------------------------------------------------------- summary

/** Wilson 95% interval for a proportion, as [low, high] in percent. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (centre - half), 100 * (centre + half)];
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "-");
const rate = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} (${n ? ((100 * k) / n).toFixed(0) : "-"}%, CI ${lo.toFixed(0)}-${hi.toFixed(0)})`;
};

type Summary = Record<string, unknown>;
const summaries: Summary[] = [];
for (const kind of only) {
  const r = rows.filter((x) => x.case === kind);
  const feas = r.filter((x) => x.feasible);
  const conds = ["jang", "priceOnly", "posted", "oracle"] as const;
  const s: Summary = {
    case: kind,
    markets: r.length,
    feasible: feas.length,
    feasiblePriceOnly: r.filter((x) => x.feasiblePriceOnly).length,
    falseAgreements: r.filter((x) => !x.feasible && (x.jang.agreed || x.priceOnly.agreed)).length,
    violations: r.reduce((a, x) => a + (x.jang.violations ?? 0) + (x.priceOnly.violations ?? 0), 0),
    jangOnlyWins: feas.filter((x) => x.jang.agreed && !x.priceOnly.agreed).length,
    priceOnlyOnlyWins: feas.filter((x) => !x.jang.agreed && x.priceOnly.agreed).length,
  };
  for (const c of conds) {
    const closed = feas.filter((x) => x[c].agreed);
    const qs = closed.map((x) => x[c].q!).filter(Boolean);
    s[c] = {
      closed: closed.length,
      closingRate: rate(closed.length, feas.length),
      paretoOptimal: rate(qs.filter((q) => q.paretoOptimal).length, qs.length),
      meanEfficiency: f(mean(qs.map((q) => q.efficiency))),
      meanParetoDistance: f(mean(qs.map((q) => q.paretoDistance))),
      meanBuyerShare: f(mean(qs.map((q) => q.buyerShare))),
      ...(c === "jang" || c === "priceOnly"
        ? {
            meanRounds: f(mean(r.map((x) => x[c].rounds ?? 0)), 1),
            meanApiCalls: f(mean(r.map((x) => x[c].apiCalls ?? 0)), 1),
            meanMs: f(mean(r.map((x) => x[c].ms ?? 0)), 1),
          }
        : {}),
    };
  }
  summaries.push(s);
}

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {}

const out = {
  hw7: true,
  variant,
  seed,
  maxRounds,
  deadlineAware,
  respectBounds,
  meso,
  disclose,
  toughness: TOUGHNESS,
  caseSize: CASE_SIZE,
  commit,
  node: process.version,
  ranAt: new Date().toISOString(),
  elapsedSeconds: Number(elapsedS.toFixed(1)),
  summaries,
  rows,
};
mkdirSync(outDir, { recursive: true });
const file = `${outDir}/${variant}-seed${seed}.json`;
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);

console.log(`\nHW7 benchmark  variant=${variant}  seed=${seed}  maxRounds=${maxRounds}  (${elapsedS.toFixed(1)}s)`);
for (const s of summaries as any[]) {
  console.log(`\n[${s.case}] markets ${s.markets}, feasible ${s.feasible} (price-only feasible ${s.feasiblePriceOnly}), false agreements ${s.falseAgreements}, violations ${s.violations}`);
  console.log(`  JANG-only closes ${s.jangOnlyWins}, price-only-only closes ${s.priceOnlyOnlyWins}`);
  for (const c of ["jang", "priceOnly", "posted", "oracle"]) {
    const v = s[c];
    console.log(
      `  ${c.padEnd(9)} close ${v.closingRate.padEnd(26)} pareto ${v.paretoOptimal.padEnd(26)} eff ${v.meanEfficiency}  dist ${v.meanParetoDistance}  buyerShare ${v.meanBuyerShare}` +
        (v.meanRounds ? `  rounds ${v.meanRounds} calls ${v.meanApiCalls} ms ${v.meanMs}` : ""),
    );
  }
}
console.log(`\nwrote ${file}`);
