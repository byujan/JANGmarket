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
 *   confirm K   boundary confirmation: each owner is shown K packages near their lodged
 *               walk-away (lodged utility within 0.05, chosen where a weight error within
 *               factor 1.35 most widens the package-vs-outside-offer interval), told whether
 *               their agent would accept, and answers from the TRUE mandate (wrong with
 *               probability e). A wrongly accepted package raises the walk-away just above
 *               it; a wrongly refused one lowers it to it (lowers first, raises win). Allowed:
 *               packages within limits whose lodged utility clears BOTH adjusted walk-aways.
 *               Rows: confirm 3 (e=0), confirm 3, 10% wrong, confirm 5, confirm 3 + min
 *               (also requires the min(money,rank) condition).
 *   refit K     Bayesian refit of the WEIGHTS (not just the walk-away) from the answers. Per owner,
 *               M prior samples w = lodged_w * exp(0.3 z); drop those violating the owner's
 *               (true) ranking; then K adaptive confirmations: the package near the outside
 *               offer on which the samples disagree most is shown, the owner answers from the
 *               TRUE mandate (wrong with probability e), and samples are reweighted 0.95 / 0.05
 *               by agreement (model always assumes 5% noise). Final rule "mean": importance-
 *               weighted mean weights, walk-away = outside offer's utility under them;
 *               "80% sure": a package is allowed iff >= 80% of the weight mass of samples
 *               prefers it to the outside offer. Rows: refit 3, refit 3 10% wrong, refit 5,
 *               refit 0 (ranking only, no questions), refit 3 80% sure. If every sample is
 *               dropped by the ranking, the lodged weights are kept.
 *               "refit K +m": the "mean" rule with a safety margin: the walk-away is raised by m
 *               (normalized utility), so a package must beat the outside offer by m under the
 *               refitted weights. Also applied when every sample is dropped (lodged weights).
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
 *   npx tsx scripts/final/guard-sim.ts [--cases=ordinary,narrow] [--draws=10] [--noise=0.3] [--samples=100]
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
export type Lodged = { party: Party; batna: Terms; order: string[]; rankW: Record<string, number> };

/** The owner's mandate from the money questions, answered with log-normal error. */
export type Source = "money" | "rank" | "exact";

export function lodge(party: Party, market: Scenario, rand: () => number, source: Source = "money"): Lodged {
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

export type Package = ReturnType<typeof groundTruth>["feasible"][number];
const lodgedUtility = (t: Terms, l: Lodged) => utility(t, { preferences: l.party.preferences });

/** Width of the interval of the package-vs-outside-offer difference over weights within factor F of the lodged ones. */
function flipWidth(terms: Terms, l: Lodged, F: number): number {
  let lo = 0, hi = 0;
  for (const [k, p] of Object.entries(l.party.preferences) as [string, Preference][]) {
    const d = dimensionScore(terms[k], p.ideal, p.worst) - dimensionScore(l.batna[k] ?? p.worst, p.ideal, p.worst);
    lo += d * (d > 0 ? p.weight / F : p.weight * F);
    hi += d * (d > 0 ? p.weight * F : p.weight / F);
  }
  return hi - lo;
}

/** The owner's lodged walk-away after the boundary confirmation. */
function confirmedWalkAway(l: Lodged, trueM: ReturnType<typeof issueMandate>, withinLimits: Package[], K: number, e: number, rand: () => number): number {
  const lodgedWalk = l.party.reservationUtility;
  const cands = withinLimits
    .map((p) => ({ t: p.terms, u: lodgedUtility(p.terms, l) }))
    .filter((c) => Math.abs(c.u - lodgedWalk) <= 0.05)
    .map((c) => ({ ...c, width: flipWidth(c.t, l, 1.35) }))
    .sort((a, b) => b.width - a.width);
  const shown: typeof cands = [];
  const seen = new Set<string>();
  for (const c of cands) {
    const key = JSON.stringify(Object.entries(c.t).sort());
    if (seen.has(key)) continue;
    seen.add(key);
    shown.push(c);
    if (shown.length >= K) break;
  }
  const lowers: number[] = [], raises: number[] = [];
  for (const c of shown) {
    const agentAccepts = c.u >= lodgedWalk;
    const truthAccepts = utility(c.t, trueM) >= trueM.reservationUtility;
    const ownerYes = rand() < e ? !truthAccepts : truthAccepts;
    if (agentAccepts && !ownerYes) raises.push(c.u + 0.001);
    else if (!agentAccepts && ownerYes) lowers.push(c.u);
  }
  let walk = lodgedWalk;
  for (const u of lowers) walk = Math.min(walk, u);
  for (const u of raises) walk = Math.max(walk, u);
  return walk;
}

/** Guards that need both lodged mandates and both true mandates, and return the allowed list. */
type GroupGuard = { name: string; K: number; e: number; min?: boolean };
const GROUP_GUARDS: GroupGuard[] = [
  { name: "confirm 3", K: 3, e: 0 },
  { name: "confirm 3, 10% wrong", K: 3, e: 0.1 },
  { name: "confirm 5", K: 5, e: 0 },
  { name: "confirm 3 + min", K: 3, e: 0, min: true },
];

const M = Number(arg("samples", "100")); // 300 roughly doubles the run time
type Refit = { name: string; K: number; e: number; sure?: boolean; margin?: number };
const REFITS: Refit[] = [
  { name: "refit 3", K: 3, e: 0 },
  { name: "refit 3, 10% wrong", K: 3, e: 0.1 },
  { name: "refit 5", K: 5, e: 0 },
  { name: "refit 0", K: 0, e: 0 },
  { name: "refit 3, 80% sure", K: 3, e: 0, sure: true },
  { name: "refit 3 +0.01", K: 3, e: 0, margin: 0.01 },
  { name: "refit 3 +0.02", K: 3, e: 0, margin: 0.02 },
  { name: "refit 3 +0.03", K: 3, e: 0, margin: 0.03 },
  { name: "refit 3 +0.05", K: 3, e: 0, margin: 0.05 },
  { name: "refit 5 +0.02", K: 5, e: 0, margin: 0.02 },
  { name: "refit 3 +.02 10%wr", K: 3, e: 0.1, margin: 0.02 },
];
const ROWS = [...GUARDS.map((g) => g.name), ...GROUP_GUARDS.map((g) => g.name), ...REFITS.map((g) => g.name)];

/** Prior weight samples for one owner, with the per-package utility differences vs the outside offer under each sample. */
export type Prior = { keys: string[]; w0: number[]; W: Float64Array; ok: Uint8Array; diff: Float64Array; S: Float64Array; P: number; T: number; anyOk: boolean };
export function makePrior(l: Lodged, trueM: ReturnType<typeof issueMandate>, withinLimits: Package[], rand: () => number): Prior {
  const keys = Object.keys(l.party.preferences);
  const T = keys.length, P = withinLimits.length;
  const w0 = keys.map((k) => l.party.preferences[k].weight);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const trueW = Object.fromEntries(keys.map((k) => [k, trueM.preferences[k].weight]));
  const trueOrder = [...keys].sort((a, b) => trueW[b] - trueW[a] || (a < b ? -1 : 1));
  const W = new Float64Array(M * T), ok = new Uint8Array(M);
  let anyOk = false;
  for (let m = 0; m < M; m += 1) {
    for (let t = 0; t < T; t += 1) W[m * T + t] = w0[t] * Math.exp(NOISE * gauss());
    const order = [...keys.keys()].sort((a, b) => W[m * T + b] - W[m * T + a] || (keys[a] < keys[b] ? -1 : 1)).map((i) => keys[i]);
    ok[m] = order.every((k, i) => k === trueOrder[i]) ? 1 : 0;
    if (ok[m]) anyOk = true;
  }
  const diff = new Float64Array(P * T), S = new Float64Array(P * M);
  withinLimits.forEach((p, i) => {
    keys.forEach((k, t) => {
      const pr = l.party.preferences[k];
      diff[i * T + t] = dimensionScore(p.terms[k], pr.ideal, pr.worst) - dimensionScore(l.batna[k] ?? pr.worst, pr.ideal, pr.worst);
    });
    for (let m = 0; m < M; m += 1) {
      let v = 0;
      for (let t = 0; t < T; t += 1) v += W[m * T + t] * diff[i * T + t];
      S[i * M + m] = v;
    }
  });
  return { keys, w0, W, ok, diff, S, P, T, anyOk };
}

/** Run K adaptive confirmations, then return the owner's acceptance of every package in withinLimits. */
export function refitAccept(pr: Prior, trueM: ReturnType<typeof issueMandate>, withinLimits: Package[], K: number, e: number, sure: boolean, rand: () => number, margin = 0): boolean[] {
  const { W, diff, S, P, T } = pr;
  // Margin: the package must beat the outside offer by `margin` in (normalized) utility.
  const verdictNow = (w: number[], i: number) => {
    let v = 0;
    for (let t = 0; t < T; t += 1) v += w[t] * diff[i * T + t];
    return v / w.reduce((a, b) => a + b, 0) >= margin - 1e-9;
  };
  if (!pr.anyOk) return Array.from({ length: P }, (_, i) => verdictNow(pr.w0, i));
  const imp = Float64Array.from(pr.ok, (x) => x);
  const mean = () => {
    const est = new Array(T).fill(0);
    let tot = 0;
    for (let m = 0; m < M; m += 1) {
      if (!imp[m]) continue;
      tot += imp[m];
      for (let t = 0; t < T; t += 1) est[t] += imp[m] * W[m * T + t];
    }
    return est.map((x) => x / tot);
  };
  const used = new Set<number>();
  for (let r = 0; r < K; r += 1) {
    const est = mean();
    const sumW = est.reduce((a, b) => a + b, 0);
    let pick = -1, bestGap = Infinity, pickP = 0;
    for (let i = 0; i < P; i += 1) {
      if (used.has(i)) continue;
      let v = 0;
      for (let t = 0; t < T; t += 1) v += est[t] * diff[i * T + t];
      if (Math.abs(v / sumW) > 0.05) continue;
      let yes = 0, tot = 0;
      for (let m = 0; m < M; m += 1) {
        tot += imp[m];
        if (S[i * M + m] >= 0) yes += imp[m];
      }
      const gap = Math.abs(yes / tot - 0.5);
      if (gap < bestGap) { bestGap = gap; pick = i; pickP = yes / tot; }
    }
    void pickP;
    if (pick < 0) break;
    used.add(pick);
    const truth = utility(withinLimits[pick].terms, trueM) >= trueM.reservationUtility;
    const answer = rand() < e ? !truth : truth;
    for (let m = 0; m < M; m += 1) imp[m] *= (S[pick * M + m] >= 0) === answer ? 0.95 : 0.05;
  }
  if (sure) {
    let tot = 0;
    for (let m = 0; m < M; m += 1) tot += imp[m];
    return Array.from({ length: P }, (_, i) => {
      let yes = 0;
      for (let m = 0; m < M; m += 1) if (S[i * M + m] >= 0) yes += imp[m];
      return yes / tot >= 0.8 - 1e-12;
    });
  }
  const est = mean();
  return Array.from({ length: P }, (_, i) => verdictNow(est, i));
}

// Only when run directly, so scripts/final/multi-sim.ts can reuse the helpers above.
if (process.argv[1]?.endsWith("guard-sim.ts")) {
for (const kind of cases) {
  const s = Object.fromEntries(ROWS.map((name) => [name, { runs: 0, dead: 0, unsafe: 0, allowed: 0, bad: 0, eff: 0, short: 0, big: 0 }]));
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
      const runs: { name: string; allowed: Package[] }[] = GUARDS.map((g) => {
        const { lb, ls, allowed: byMandates } = bySource.get(g.source ?? "money")!;
        const allowedByMandates = g.wide ? withinLimits : byMandates;
        return { name: g.name, allowed: allowedByMandates.filter((p) => g.ok(p.terms, lb) && g.ok(p.terms, ls)) };
      });
      GROUP_GUARDS.forEach((g, gi) => {
        // Own random streams, so the existing guards' draws are untouched.
        const rb = mulberry32(seed + index * 31 + d * 7919 + gi * 104729 + 1);
        const rs = mulberry32(seed + index * 31 + d * 7919 + gi * 104729 + 2);
        const wb = confirmedWalkAway(money.lb, tb, withinLimits, g.K, g.e, rb);
        const wsl = confirmedWalkAway(money.ls, ts, withinLimits, g.K, g.e, rs);
        let allowed = withinLimits.filter((p) => lodgedUtility(p.terms, money.lb) >= wb && lodgedUtility(p.terms, money.ls) >= wsl);
        if (g.min) allowed = allowed.filter((p) => beatsUnder(p.terms, money.lb, money.lb.rankW) && beatsUnder(p.terms, money.ls, money.ls.rankW));
        runs.push({ name: g.name, allowed });
      });
      // Refit rows: own streams (prior samples shared by all refit rows, answer noise per row).
      const priorB = makePrior(money.lb, tb, withinLimits, mulberry32(seed + index * 31 + d * 7919 + 9100001));
      const priorS = makePrior(money.ls, ts, withinLimits, mulberry32(seed + index * 31 + d * 7919 + 9100002));
      REFITS.forEach((g, gi) => {
        const rb = mulberry32(seed + index * 31 + d * 7919 + gi * 104729 + 9200001);
        const rs = mulberry32(seed + index * 31 + d * 7919 + gi * 104729 + 9200002);
        const accB = refitAccept(priorB, tb, withinLimits, g.K, g.e, !!g.sure, rb, g.margin ?? 0);
        const accS = refitAccept(priorS, ts, withinLimits, g.K, g.e, !!g.sure, rs, g.margin ?? 0);
        runs.push({ name: g.name, allowed: withinLimits.filter((_, i) => accB[i] && accS[i]) });
      });
      for (const { name, allowed } of runs) {
        const stRun = s[name];
        stRun.runs += 1;
        if (!allowed.length) {
          stRun.dead += 1;
          continue;
        }
        const st = s[name];
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
  console.log(`  ${"guard".padEnd(21)} ${"no deal".padStart(8)} ${"unsafe".padStart(8)} ${"bad share".padStart(10)} ${"best eff.".padStart(10)} ${"mean short".padStart(11)} ${"short>0.05".padStart(11)}`);
  for (const name of ROWS) {
    const st = s[name];
    const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
    console.log(
      `  ${name.padEnd(21)} ${pct(st.dead / st.runs).padStart(8)} ${pct(st.unsafe / st.runs).padStart(8)} ${pct(st.bad / Math.max(1, st.allowed)).padStart(10)} ${(st.eff / st.runs).toFixed(3).padStart(10)} ${(st.short / Math.max(1, st.bad)).toFixed(3).padStart(11)} ${pct(st.big / Math.max(1, st.allowed)).padStart(11)}`,
    );
  }
}
}
