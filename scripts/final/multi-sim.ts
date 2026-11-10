#!/usr/bin/env tsx
/**
 * Does a safety margin still cost deals when an owner can try another counterparty?
 *
 * guard-sim.ts judges one buyer against one seller. Here one "focal" owner (buyer, then
 * seller, both counted) meets up to N counterparties in turn and takes the first one with
 * which the two mandates allow some package. No deal with all N means the owner takes their
 * outside offer, worth exactly their true walk-away (gain 0), not a loss.
 *
 * Counterparty j = 0 is the market's own other side (so N = 1 is guard-sim's setting).
 * Counterparty j >= 1 is the other side of another market of the same case, with its price
 * terms shifted so that the pair's price overlap (ceiling - floor) is that other market's:
 * a narrow case stays narrow with every counterparty (the whole market is tight), while
 * weights, walk-aways and the other terms differ.
 *
 * The focal owner answers the questions ONCE (one set of dollar answers, one refit with
 * 3 truthful checks, asked over every package within their limits across the N pairs), so
 * the same weight error follows them to every counterparty. Each counterparty lodges its
 * own mandate the same way. Margin m: a package must beat the outside offer by m under the
 * refitted weights, for both sides.
 *
 * Reported for the focal owner, per case, margin and N:
 *   no deal     no counterparty allows anything (falls back to the outside offer)
 *   bad risk    the deal that happens allows some package below the focal owner's TRUE
 *               walk-away (a hard-bargaining counterparty could push them there)
 *   gain avg    focal true utility minus true walk-away, averaged over the allowed
 *               packages of the deal (no deal = 0)
 *   gain edge   the same at the allowed package worst for the focal owner (no deal = 0)
 *   tries       counterparties met on average
 *
 *   npx tsx scripts/final/multi-sim.ts [--cases=ordinary,narrow] [--draws=5] [--n=1,3,5] [--margins=0,0.01,0.02,0.03]
 */
import { issueMandate, type Party, type Scenario } from "../../src/lib/jang/scenario.ts";
import { utility } from "../../src/lib/jang/utility.ts";
import { loadScenario } from "../common.ts";
import { groundTruth, makeMarket, mulberry32, type CaseName } from "../hw7/lib.ts";
import { lodge, makePrior, refitAccept, type Lodged, type Package } from "./guard-sim.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const cases = arg("cases", "ordinary,narrow").split(",") as CaseName[];
const draws = Number(arg("draws", "5"));
const NS = arg("n", "1,3,5").split(",").map(Number);
const MARGINS = arg("margins", "0,0.01,0.02,0.03").split(",").map(Number);
const MAX_N = Math.max(...NS);
const K = 3;
const seed = 20261101;
const base = loadScenario();

const priceMax = (p: Party) => (p.constraints.price as { max: number }).max;
const priceMin = (p: Party) => (p.constraints.price as { min: number }).min;

/** Seller of `other`, re-anchored so its floor sits `gap` below this buyer's ceiling. */
function sellerFor(buyer: Party, other: Scenario): Party {
  const gap = priceMax(other.buyer) - priceMin(other.seller);
  const floor = priceMax(buyer) - gap;
  const s = other.seller;
  return {
    ...s,
    constraints: { ...s.constraints, price: { min: floor } },
    preferences: { ...s.preferences, price: { ...s.preferences.price, ideal: floor + 700, worst: floor } },
  };
}

/** Buyer of `other`, re-anchored so its ceiling sits `gap` above this seller's floor. */
function buyerFor(seller: Party, other: Scenario): Party {
  const gap = priceMax(other.buyer) - priceMin(other.seller);
  const ceiling = priceMin(seller) + gap;
  const b = other.buyer;
  return {
    ...b,
    constraints: { ...b.constraints, price: { max: ceiling } },
    preferences: { ...b.preferences, price: { ...b.preferences.price, ideal: Math.max(600, ceiling - 600), worst: ceiling } },
  };
}

const key = (p: Package) => JSON.stringify(p.terms);
type Stat = { runs: number; dead: number; risky: number; gainAvg: number; gainEdge: number; tries: number };

for (const kind of cases) {
  const stats = new Map<string, Stat>();
  const stat = (m: number, n: number) => {
    const k = `${m}|${n}`;
    if (!stats.has(k)) stats.set(k, { runs: 0, dead: 0, risky: 0, gainAvg: 0, gainEdge: 0, tries: 0 });
    return stats.get(k)!;
  };
  let markets = 0;
  for (let index = 0; index < 200; index += 1) {
    const truth = makeMarket(base, kind, seed, index);
    if (!groundTruth(issueMandate(truth, "buyer"), issueMandate(truth, "seller"), truth).feasible.length) continue;
    markets += 1;
    const others = Array.from({ length: MAX_N - 1 }, (_, j) => makeMarket(base, kind, seed, 1000 + index * 10 + j));

    for (const role of ["buyer", "seller"] as const) {
      // Pair j: the focal owner (from `truth`) against counterparty j.
      const pairs: Scenario[] = [truth];
      for (const other of others) {
        pairs.push(role === "buyer" ? { ...truth, seller: sellerFor(truth.buyer, other) } : { ...truth, buyer: buyerFor(truth.seller, other) });
      }
      for (let d = 0; d < draws; d += 1) {
        const r = (salt: number) => mulberry32(seed + index * 31 + d * 7919 + salt + (role === "buyer" ? 0 : 500009));
        const focalTrue = issueMandate(truth, role);
        const focal = lodge(truth[role], truth, r(1));

        // Every package within both sides' limits, per pair.
        const data = pairs.map((pair, j) => {
          const cpRole = role === "buyer" ? "seller" : "buyer";
          const cpTrue = issueMandate(pair, cpRole);
          const cp = lodge(pair[cpRole], pair, r(100 + j));
          const open = { ...pair, [role]: { ...focal.party, reservationUtility: 0 }, [cpRole]: { ...cp.party, reservationUtility: 0 } } as Scenario;
          const within = groundTruth(issueMandate(open, "buyer"), issueMandate(open, "seller"), open).feasible;
          return { within, cp, cpTrue };
        });

        // The focal owner's one refit, over every package they might be shown.
        const union = new Map<string, Package>();
        for (const { within } of data) for (const p of within) union.set(key(p), p);
        const focalPkgs = [...union.values()];
        const focalPrior = makePrior(focal, focalTrue, focalPkgs, r(2));
        const cpPriors = data.map(({ within, cp, cpTrue }, j) => makePrior(cp as Lodged, cpTrue, within, r(200 + j)));

        for (const margin of MARGINS) {
          const focalOk = refitAccept(focalPrior, focalTrue, focalPkgs, K, 0, false, r(3), margin);
          const focalAccepts = new Set(focalPkgs.filter((_, i) => focalOk[i]).map(key));
          const allowed = data.map(({ within, cpTrue }, j) => {
            const cpOk = refitAccept(cpPriors[j], cpTrue, within, K, 0, false, r(300 + j), margin);
            return within.filter((p, i) => cpOk[i] && focalAccepts.has(key(p)));
          });
          for (const n of NS) {
            const st = stat(margin, n);
            st.runs += 1;
            const j = allowed.slice(0, n).findIndex((a) => a.length > 0);
            if (j < 0) {
              st.dead += 1;
              st.tries += n;
              continue;
            }
            st.tries += j + 1;
            const gains = allowed[j].map((p) => utility(p.terms, focalTrue) - focalTrue.reservationUtility);
            if (gains.some((g) => g < -1e-9)) st.risky += 1;
            st.gainAvg += gains.reduce((a, b) => a + b, 0) / gains.length;
            st.gainEdge += Math.min(...gains);
          }
        }
      }
    }
  }

  console.log(`\n${kind}: ${markets} feasible markets x 2 roles x ${draws} draws (refit ${K} checks)`);
  console.log(`  ${"margin".padEnd(7)} ${"N".padStart(2)} ${"no deal".padStart(8)} ${"bad risk".padStart(9)} ${"gain avg".padStart(9)} ${"gain edge".padStart(10)} ${"tries".padStart(6)}`);
  for (const margin of MARGINS) {
    for (const n of NS) {
      const st = stat(margin, n);
      const pct = (x: number) => `${(100 * x / st.runs).toFixed(1)}%`;
      console.log(
        `  ${("+" + margin.toFixed(2)).padEnd(7)} ${String(n).padStart(2)} ${pct(st.dead).padStart(8)} ${pct(st.risky).padStart(9)} ${(st.gainAvg / st.runs).toFixed(3).padStart(9)} ${(st.gainEdge / st.runs).toFixed(3).padStart(10)} ${(st.tries / st.runs).toFixed(2).padStart(6)}`,
      );
    }
  }
}
