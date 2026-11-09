#!/usr/bin/env tsx
/**
 * Would magnitude questions fix the new builder? No Claude calls.
 *
 * For every feasible market, both owners lodge mandates built four ways, and
 * we count markets where no deal is left and how much realised efficiency the
 * mandates cost when the best remaining deal is struck:
 *
 *   roc         the current builder: order -> rank-order centroid weights
 *   dollars±X   the owner states what each term is worth in dollars, wrong by
 *               a log-normal factor (sigma X, so ±30% or ±50% typical errors);
 *               the order is still fixed by the choice questions
 *   true        exact weights (what is left is the outside-offer step itself)
 *   ... slack   the same, with the walk-away --slack (default 0.03) below the offer
 *
 * In every arm the reservation comes from an outside offer worth exactly the
 * owner's true reservation, valued under the lodged weights, as the builder does.
 *
 *   npx tsx scripts/final/magnitude-sim.ts [--cases=ordinary,narrow] [--draws=10]
 */
import { reservationFromAlternative, weightsFromRanking } from "../../src/lib/jang/elicit.ts";
import { issueMandate, type Party, type Scenario } from "../../src/lib/jang/scenario.ts";
import type { Terms } from "../../src/lib/jang/types.ts";
import { utility } from "../../src/lib/jang/utility.ts";
import { loadScenario } from "../common.ts";
import { groundTruth, makeMarket, mulberry32, type CaseName } from "../hw7/lib.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const cases = arg("cases", "ordinary,narrow").split(",") as CaseName[];
const draws = Number(arg("draws", "10"));
const seed = 20261101;
const base = loadScenario();

type Weights = "roc" | "dollars±30%" | "dollars±50%" | "true";
type Method = Weights | `${Weights} slack`;
const METHODS: Method[] = ["roc", "dollars±30%", "dollars±50%", "true", "roc slack", "dollars±30% slack"];
/** "slack": the walk-away sits this far below what the outside offer is worth. */
const SLACK = Number(arg("slack", "0.03"));

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function lodged(party: Party, market: Scenario, full: Method, rand: () => number): Party {
  const method = full.replace(" slack", "") as Weights;
  const slack = full.endsWith("slack") ? SLACK : 0;
  const entries = Object.entries(party.preferences);
  const order = [...entries].sort(([ka, a], [kb, b]) => b.weight - a.weight || (ka < kb ? -1 : 1)).map(([k]) => k);
  let w: Record<string, number>;
  if (method === "roc") w = weightsFromRanking(order);
  else if (method === "true") w = Object.fromEntries(entries.map(([k, p]) => [k, p.weight]));
  else {
    const sigma = method === "dollars±30%" ? 0.3 : 0.5;
    w = Object.fromEntries(entries.map(([k, p]) => [k, p.weight * Math.exp(sigma * gauss(rand))]));
    // The choice questions already fixed the order; keep the noisy sizes consistent with it.
    const sorted = order.map((k) => w[k]).sort((a, b) => b - a);
    order.forEach((k, i) => (w[k] = sorted[i]));
  }
  const preferences = Object.fromEntries(entries.map(([k, p]) => [k, { ...p, weight: w[k] }]));

  // Outside offer worth exactly the true reservation to this owner.
  const keys = Object.keys(party.preferences);
  let grid: Terms[] = [{}];
  for (const k of keys) {
    const p = party.preferences[k];
    const step = market.itemSpec.dimensions.find((d) => d.key === k)?.step ?? 1;
    const values = new Set<number>();
    for (let i = 0; i <= 7; i += 1) values.add(Math.round((p.worst + ((p.ideal - p.worst) * i) / 7) / step) * step);
    grid = grid.flatMap((t) => [...values].map((v) => ({ ...t, [k]: v })));
  }
  const scored = grid.map((t) => ({ t, gap: Math.abs(utility(t, { preferences: party.preferences }) - party.reservationUtility) }));
  const close = scored.filter((s) => s.gap < 0.01);
  const pool = close.length ? close : [scored.reduce((a, b) => (b.gap < a.gap ? b : a))];
  const batna = pool[Math.floor(rand() * pool.length)].t;
  return { ...party, preferences, reservationUtility: Math.max(0, reservationFromAlternative(batna, preferences) - slack) };
}

for (const kind of cases) {
  const stats = Object.fromEntries(METHODS.map((m) => [m, { runs: 0, dead: 0, lostEff: 0, bad: 0, live: 0 }]));
  let markets = 0;
  for (let index = 0; index < 200; index += 1) {
    const truth = makeMarket(base, kind, seed, index);
    const tb = issueMandate(truth, "buyer"), ts = issueMandate(truth, "seller");
    const gt = groundTruth(tb, ts, truth);
    if (!gt.feasible.length) continue;
    markets += 1;
    for (const method of METHODS) {
      const rand = mulberry32(seed + index * 17 + METHODS.indexOf(method));
      for (let d = 0; d < (method === "true" ? 1 : draws); d += 1) {
        const m = { ...truth, buyer: lodged(truth.buyer, truth, method, rand), seller: lodged(truth.seller, truth, method, rand) };
        const lt = groundTruth(issueMandate(m, "buyer"), issueMandate(m, "seller"), m);
        const s = stats[method];
        s.runs += 1;
        if (!lt.feasible.length) {
          s.dead += 1;
          s.lostEff += 1;
          continue;
        }
        // Best deal the lodged mandates allow, judged by TRUE joint surplus.
        let best = -Infinity;
        for (const p of lt.feasible) {
          const terms = (p as { terms?: Terms }).terms;
          if (!terms) continue;
          const surplus = utility(terms, tb) - tb.reservationUtility + utility(terms, ts) - ts.reservationUtility;
          if (surplus > best) best = surplus;
        }
        // Risk: share of deals the lodged mandates allow that an owner would truly refuse.
        s.live += lt.feasible.length;
        s.bad += lt.feasible.filter((p) => p.buyer < tb.reservationUtility - 1e-9 || p.seller < ts.reservationUtility - 1e-9).length;
        if (Number.isFinite(best) && gt.maxSurplus > 0) s.lostEff += Math.max(0, 1 - best / gt.maxSurplus);
      }
    }
  }
  console.log(`\n${kind}: ${markets} feasible markets`);
  for (const method of METHODS) {
    const s = stats[method];
    console.log(
      `  ${method.padEnd(12)} no deal left ${((100 * s.dead) / s.runs).toFixed(1).padStart(5)}%   efficiency lost (incl. dead) ${((100 * s.lostEff) / s.runs).toFixed(1).padStart(5)}%   allowed deals an owner would refuse ${((100 * s.bad) / Math.max(1, s.live)).toFixed(1).padStart(5)}%`,
    );
  }
}
