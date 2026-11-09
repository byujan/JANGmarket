#!/usr/bin/env tsx
/**
 * Can the walk-away be protected against error in the owner's money answers?
 * No Claude calls.
 *
 * With weights from noisy dollar answers, a package can clear the lodged
 * reservation while being worse for the owner than their outside offer (the
 * asymmetric #3 deal in the Claude rerun). Guards tried, each applied to both
 * owners on top of the lodged mandate:
 *
 *   rank only   for comparison: weights from the ranking alone (rank-order centroid)
 *   exact weights  for comparison: the owner's true weights, outside offer as usual
 *   none        the money questions as built: utility under the lodged weights >= the
 *               outside offer's utility under the same weights
 *   robust xF   the package must beat the outside offer under EVERY weight
 *               vector within a factor F of the lodged one. The difference is
 *               linear in the weights, so the worst case is closed form.
 *   top term    no worse than the outside offer on the term ranked first
 *
 * Reported per case, over every feasible market x draws of the dollar errors:
 *   no deal     markets where the guard leaves nothing both sides allow
 *   unsafe      markets where SOME allowed package is worse for an owner than
 *               their true walk-away (an agent could sign it)
 *   bad share   of all allowed packages, the share worse for an owner than walking
 *   mean short  among bad packages, how far below the true walk-away (utility)
 *   short>0.05  of all allowed packages, the share more than 0.05 below it
 *   best eff.   the best allowed package's efficiency, judged by the truth
 *               (no deal counts 0), what a good agent could reach
 *
 *   npx tsx scripts/final/guard-sim.ts [--cases=ordinary,narrow] [--draws=10] [--noise=0.3]
 */
import { reservationFromAlternative, weightsFromRanking, weightsFromSwings } from "../../src/lib/jang/elicit.ts";
import { issueMandate, type Party, type Scenario } from "../../src/lib/jang/scenario.ts";
import type { Preference, Terms } from "../../src/lib/jang/types.ts";
import { dimensionScore, utility } from "../../src/lib/jang/utility.ts";
import { loadScenario } from "../common.ts";
import { groundTruth, makeMarket, mulberry32, type CaseName } from "../hw7/lib.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const cases = arg("cases", "ordinary,narrow").split(",") as CaseName[];
const draws = Number(arg("draws", "10"));
const NOISE = Number(arg("noise", "0.3"));
const seed = 20261101;
const base = loadScenario();

/** `rankW`: weights from the owner's ranking alone (rank-order centroid), kept for the min/max guards. */
type Lodged = { party: Party; batna: Terms; order: string[]; rankW: Record<string, number> };

/** The owner's mandate from the money questions, answered with log-normal error. */
type Source = "money" | "rank" | "exact";

function lodge(party: Party, market: Scenario, rand: () => number, source: Source = "money"): Lodged {
  const prefs = party.preferences;
  const price = prefs.price;
  const range = Math.abs(price.ideal - price.worst);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const swings = Object.fromEntries(
    Object.entries(prefs)
      .filter(([k]) => k !== "price")
      .map(([k, p]) => [k, (p.weight / price.weight) * range * Math.exp(NOISE * gauss())]),
  );
  const anchors = Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, { ideal: p.ideal, limit: p.worst }]));
  const trueOrder = Object.keys(prefs).sort((a, b) => prefs[b].weight - prefs[a].weight || (a < b ? -1 : 1));
  const w =
    source === "money"
      ? weightsFromSwings("price", swings, anchors)!
      : source === "rank"
        ? weightsFromRanking(trueOrder)
        : Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, p.weight]));
  const preferences = Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, { ...p, weight: w[k] }]));
  const order = Object.keys(w).sort((a, b) => w[b] - w[a]);

  // Outside offer worth exactly the true reservation to this owner.
  let grid: Terms[] = [{}];
  for (const k of Object.keys(prefs)) {
    const p = prefs[k];
    const step = market.itemSpec.dimensions.find((d) => d.key === k)?.step ?? 1;
    const values = new Set<number>();
    for (let i = 0; i <= 7; i += 1) values.add(Math.round((p.worst + ((p.ideal - p.worst) * i) / 7) / step) * step);
    grid = grid.flatMap((t) => [...values].map((v) => ({ ...t, [k]: v })));
  }
  const scored = grid.map((t) => ({ t, gap: Math.abs(utility(t, { preferences: prefs }) - party.reservationUtility) }));
  const close = scored.filter((s) => s.gap < 0.01);
  const pool = close.length ? close : [scored.reduce((a, b) => (b.gap < a.gap ? b : a))];
  const batna = pool[Math.floor(rand() * pool.length)].t;
  return {
    party: { ...party, preferences, reservationUtility: reservationFromAlternative(batna, preferences) },
    batna,
    order,
    rankW: weightsFromRanking(trueOrder),
  };
}

/** Does `terms` beat the outside offer under every weight vector within factor F of the lodged one? */
function robustlyBetter(terms: Terms, l: Lodged, F: number): boolean {
  let worst = 0;
  for (const [k, p] of Object.entries(l.party.preferences) as [string, Preference][]) {
    const d = dimensionScore(terms[k], p.ideal, p.worst) - dimensionScore(l.batna[k] ?? p.worst, p.ideal, p.worst);
    worst += d * (d > 0 ? p.weight / F : p.weight * F);
  }
  return worst >= -1e-9;
}

function topTermOk(terms: Terms, l: Lodged): boolean {
  const k = l.order[0];
  const p = l.party.preferences[k];
  return dimensionScore(terms[k], p.ideal, p.worst) >= dimensionScore(l.batna[k] ?? p.worst, p.ideal, p.worst) - 1e-9;
}

/** Is `terms` at least as good as the outside offer under these weights? */
function beatsUnder(terms: Terms, l: Lodged, w: Record<string, number>): boolean {
  let diff = 0;
  for (const [k, p] of Object.entries(l.party.preferences) as [string, Preference][]) {
    diff += w[k] * (dimensionScore(terms[k], p.ideal, p.worst) - dimensionScore(l.batna[k] ?? p.worst, p.ideal, p.worst));
  }
  return diff >= -1e-9;
}
const moneyW = (l: Lodged) => Object.fromEntries(Object.entries(l.party.preferences).map(([k, p]) => [k, p.weight]));
const equalW = (l: Lodged) => Object.fromEntries(Object.keys(l.party.preferences).map((k) => [k, 1]));

/** `wide`: judge every package within the owner's limits, not only those the money mandate allows (needed for max). */
type Guard = { name: string; source?: Source; wide?: boolean; ok: (t: Terms, l: Lodged) => boolean };
const GUARDS: Guard[] = [
  { name: "rank only", source: "rank", ok: () => true },
  { name: "exact weights", source: "exact", ok: () => true },
  { name: "none", ok: () => true },
  { name: "robust x1.2", ok: (t, l) => robustlyBetter(t, l, 1.2) },
  { name: "robust x1.35", ok: (t, l) => robustlyBetter(t, l, 1.35) },
  { name: "robust x1.5", ok: (t, l) => robustlyBetter(t, l, 1.5) },
  { name: "top term", ok: topTermOk },
  { name: "min(money,rank)", ok: (t, l) => beatsUnder(t, l, l.rankW) },
  { name: "min(m,r,equal)", ok: (t, l) => beatsUnder(t, l, l.rankW) && beatsUnder(t, l, equalW(l)) },
  { name: "max(money,rank)", wide: true, ok: (t, l) => beatsUnder(t, l, moneyW(l)) || beatsUnder(t, l, l.rankW) },
];

for (const kind of cases) {
  const s = Object.fromEntries(GUARDS.map((g) => [g.name, { runs: 0, dead: 0, unsafe: 0, allowed: 0, bad: 0, eff: 0, short: 0, big: 0 }]));
  let markets = 0;
  for (let index = 0; index < 200; index += 1) {
    const truth = makeMarket(base, kind, seed, index);
    const tb = issueMandate(truth, "buyer"), ts = issueMandate(truth, "seller");
    const gt = groundTruth(tb, ts, truth);
    if (!gt.feasible.length) continue;
    markets += 1;
    const rand = mulberry32(seed + index * 31);
    for (let d = 0; d < draws; d += 1) {
      // Same random stream for every source, so the outside offers line up.
      const state = rand();
      const bySource = new Map<Source, { lb: Lodged; ls: Lodged; allowed: ReturnType<typeof groundTruth>["feasible"] }>();
      for (const source of ["money", "rank", "exact"] as Source[]) {
        const r = mulberry32(Math.floor(state * 2 ** 31));
        const lb = lodge(truth.buyer, truth, r, source), ls = lodge(truth.seller, truth, r, source);
        const m = { ...truth, buyer: lb.party, seller: ls.party };
        bySource.set(source, { lb, ls, allowed: groundTruth(issueMandate(m, "buyer"), issueMandate(m, "seller"), m).feasible });
      }
      // Every package within both owners' limits, whatever it is worth (reservation 0).
      const money = bySource.get("money")!;
      const open = { ...truth, buyer: { ...money.lb.party, reservationUtility: 0 }, seller: { ...money.ls.party, reservationUtility: 0 } };
      const withinLimits = groundTruth(issueMandate(open, "buyer"), issueMandate(open, "seller"), open).feasible;
      for (const g of GUARDS) {
        const { lb, ls, allowed: byMandates } = bySource.get(g.source ?? "money")!;
        const allowedByMandates = g.wide ? withinLimits : byMandates;
        const allowed = allowedByMandates.filter((p) => g.ok(p.terms, lb) && g.ok(p.terms, ls));
        const stRun = s[g.name];
        stRun.runs += 1;
        if (!allowed.length) {
          stRun.dead += 1;
          continue;
        }
        const st = s[g.name];
        let bad = 0, best = -Infinity;
        for (const p of allowed) {
          const ub = utility(p.terms, tb), us = utility(p.terms, ts);
          if (ub < tb.reservationUtility - 1e-9 || us < ts.reservationUtility - 1e-9) {
            bad += 1;
            const shortfall = Math.max(tb.reservationUtility - ub, ts.reservationUtility - us);
            st.short += shortfall;
            if (shortfall > 0.05) st.big += 1;
          }
          best = Math.max(best, ub - tb.reservationUtility + us - ts.reservationUtility);
        }
        st.allowed += allowed.length;
        st.bad += bad;
        if (bad) st.unsafe += 1;
        if (gt.maxSurplus > 0) st.eff += Math.max(0, best / gt.maxSurplus);
      }
    }
  }
  console.log(`\n${kind}: ${markets} feasible markets x ${draws} draws of dollar answers (noise sigma ${NOISE})`);
  console.log(`  ${"guard".padEnd(13)} ${"no deal".padStart(8)} ${"unsafe".padStart(8)} ${"bad share".padStart(10)} ${"best eff.".padStart(10)} ${"mean short".padStart(11)} ${"short>0.05".padStart(11)}`);
  for (const g of GUARDS) {
    const st = s[g.name];
    const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
    console.log(
      `  ${g.name.padEnd(13)} ${pct(st.dead / st.runs).padStart(8)} ${pct(st.unsafe / st.runs).padStart(8)} ${pct(st.bad / Math.max(1, st.allowed)).padStart(10)} ${(st.eff / st.runs).toFixed(3).padStart(10)} ${(st.short / Math.max(1, st.bad)).toFixed(3).padStart(11)} ${pct(st.big / Math.max(1, st.allowed)).padStart(11)}`,
    );
  }
}
