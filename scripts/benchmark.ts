#!/usr/bin/env tsx
/**
 * JANG against a posted price, over many randomised markets.
 *
 * The claim being tested is narrow and falsifiable: whenever a mutually
 * acceptable package exists, negotiation should find one more often than a
 * take-it-or-leave-it price does, and it should never produce an agreement
 * that breaches either owner's mandate.
 *
 * Ground truth comes from a grid search over both mandates, done outside the
 * negotiation, so "a deal was possible" is not the negotiator's own opinion.
 */
import { runRuleAgent } from "../agents/runner.ts";
import { RestPort } from "../agents/rest-port.ts";
import { auditAgreement } from "../src/lib/jang/agreement.ts";
import { provision } from "../src/lib/demo/provision.ts";
import { checkTermsAgainstMandate } from "../src/lib/jang/mandate.ts";
import type { Scenario } from "../src/lib/jang/scenario.ts";
import type { Mandate, Terms } from "../src/lib/jang/types.ts";
import { utility } from "../src/lib/jang/utility.ts";
import { BASE_URL, colour, ensureServer, loadScenario } from "./common.ts";

const c = colour;
const base = loadScenario();
const runs = Number(process.argv.find((arg) => arg.startsWith("--n="))?.slice(4) ?? 40);
const seed = Number(process.argv.find((arg) => arg.startsWith("--seed="))?.slice(7) ?? 20261028);

/** Deterministic PRNG so a reported number can be reproduced exactly. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ids must be unique per invocation even though the markets themselves are
// seeded and reproducible, because a long-lived server remembers past runs.
const nonce = Date.now().toString(36);
const rng = mulberry32(seed);
const between = (low: number, high: number, step = 1) => Math.round((low + rng() * (high - low)) / step) * step;

/** A market with a different cost base, budget, posted price and taste. */
function variant(index: number): Scenario {
  const floor = between(1000, 1400, 10);
  const ceiling = between(1150, 1750, 10);
  const posted = between(Math.max(floor + 50, 1250), 1850, 10);
  return {
    ...base,
    scenarioId: `${base.scenarioId}-v${index}`,
    buyer: {
      ...base.buyer,
      constraints: { price: { max: ceiling }, deliveryDays: { max: between(20, 40) } },
      preferences: {
        ...base.buyer.preferences,
        price: { weight: between(3, 7), ideal: Math.max(600, ceiling - 600), worst: ceiling },
        warrantyMonths: { ...base.buyer.preferences.warrantyMonths, weight: between(1, 4) },
      },
      reservationUtility: Number((0.25 + rng() * 0.15).toFixed(3)),
    },
    seller: {
      ...base.seller,
      constraints: { price: { min: floor }, warrantyMonths: { max: 36 } },
      preferences: {
        ...base.seller.preferences,
        price: { weight: between(3, 7), ideal: floor + 700, worst: floor },
        warrantyMonths: { ...base.seller.preferences.warrantyMonths, weight: between(1, 4) },
      },
      reservationUtility: Number((0.25 + rng() * 0.15).toFixed(3)),
    },
    fixedPriceBaseline: {
      label: "Posted shelf price",
      terms: { price: posted, deliveryDays: 21, warrantyMonths: 12, bundle: 0 },
    },
  };
}

/** Does any package satisfy both mandates at once? Searched on a coarse grid. */
function dealIsPossible(buyer: Mandate, seller: Mandate): boolean {
  const axes = base.itemSpec.dimensions.map((dimension) => {
    const values: number[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i += 1) {
      values.push(dimension.min + ((dimension.max - dimension.min) * i) / steps);
    }
    return { key: dimension.key, values };
  });

  const terms: Terms = {};
  const search = (index: number): boolean => {
    if (index === axes.length) {
      return checkTermsAgainstMandate(terms, buyer).ok && checkTermsAgainstMandate(terms, seller).ok;
    }
    for (const value of axes[index].values) {
      terms[axes[index].key] = value;
      if (search(index + 1)) return true;
    }
    return false;
  };
  return search(0);
}

type Row = {
  possible: boolean;
  jangAgreed: boolean;
  postedAccepted: boolean;
  oracleAccepted: boolean;
  rounds: number;
  ms: number;
  calls: number;
  violations: number;
  buyerValue?: number;
  sellerValue?: number;
};

const server = await ensureServer();
const rows: Row[] = [];

try {
  process.stdout.write(`${c.dim}running ${runs} negotiations (seed ${seed})${c.reset}\n`);

  for (let index = 0; index < runs; index += 1) {
    const scenario = variant(index);
    const setup = await provision(scenario, BASE_URL, `-bench-${nonce}-${index}`);
    const buyerMandate = setup.buyer.mandate;
    const sellerMandate = setup.seller.mandate;

    const possible = dealIsPossible(buyerMandate, sellerMandate);

    // The posted price only sells if it clears both owners unchanged.
    const posted = scenario.fixedPriceBaseline.terms;
    const postedAccepted =
      checkTermsAgainstMandate(posted, buyerMandate).ok && checkTermsAgainstMandate(posted, sellerMandate).ok;

    // A harder baseline: a seller who somehow knew both private limits and
    // posted the midpoint between them. It still cannot trade delivery against
    // warranty, which is the part only negotiation can do.
    const oracle = {
      ...posted,
      price: Math.round(((sellerMandate.constraints.price?.min ?? 0) + (buyerMandate.constraints.price?.max ?? 0)) / 2),
    };
    const oracleAccepted =
      checkTermsAgainstMandate(oracle, buyerMandate).ok && checkTermsAgainstMandate(oracle, sellerMandate).ok;

    const startedAt = Date.now();
    const sellerPort = new RestPort(BASE_URL, setup.seller.apiKey, setup.sessionId);
    const buyerPort = new RestPort(BASE_URL, setup.buyer.apiKey, setup.sessionId);
    const sellerRunning = runRuleAgent({ label: "seller", agent: sellerPort, options: { toughness: 1.6 }, pollMs: 5 });
    const buyerRunning = runRuleAgent({ label: "buyer", agent: buyerPort, options: { toughness: 1.5 }, pollMs: 5 });
    const [sellerRun, buyerRun] = await Promise.all([sellerRunning, buyerRunning]);
    const ms = Date.now() - startedAt;

    const agreement = sellerRun.agreement ?? buyerRun.agreement;
    let violations = 0;
    if (agreement) {
      const audit = auditAgreement(agreement, setup.jangPublicKey, { buyer: buyerMandate, seller: sellerMandate });
      violations = (audit.signatureValid ? 0 : 1) + audit.buyer.violations.length + audit.seller.violations.length;
    }

    rows.push({
      possible,
      jangAgreed: Boolean(agreement),
      postedAccepted,
      oracleAccepted,
      rounds: agreement?.rounds ?? 0,
      ms,
      calls: sellerPort.callCount + buyerPort.callCount,
      violations,
      buyerValue: agreement ? utility(agreement.terms, buyerMandate) : undefined,
      sellerValue: agreement ? utility(agreement.terms, sellerMandate) : undefined,
    });
    process.stdout.write(agreement ? `${c.green}.${c.reset}` : possible ? `${c.yellow}x${c.reset}` : `${c.dim}-${c.reset}`);
  }
  process.stdout.write("\n");
} finally {
  server.stop();
}

const feasible = rows.filter((row) => row.possible);
const closed = rows.filter((row) => row.jangAgreed);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : "n/a");

const jangOnFeasible = feasible.filter((row) => row.jangAgreed).length;
const postedOnFeasible = feasible.filter((row) => row.postedAccepted).length;
const oracleOnFeasible = feasible.filter((row) => row.oracleAccepted).length;
const closedWithoutZopa = rows.filter((row) => row.jangAgreed && !row.possible).length;
const totalViolations = rows.reduce((sum, row) => sum + row.violations, 0);

console.log(`\n${c.bold}JANG vs a posted price — ${runs} randomised markets, seed ${seed}${c.reset}\n`);
const table = [
  ["markets where a mutually acceptable deal exists", `${feasible.length} of ${runs}`],
  ["deals closed by negotiation", `${jangOnFeasible} (${pct(jangOnFeasible, feasible.length)} of those)`],
  ["deals closed at the posted price", `${postedOnFeasible} (${pct(postedOnFeasible, feasible.length)} of those)`],
  ["deals closed at an oracle midpoint price", `${oracleOnFeasible} (${pct(oracleOnFeasible, feasible.length)} of those)`],
  ["agreements where no deal was possible", `${closedWithoutZopa} (must be 0)`],
  ["constraint violations across all agreements", `${totalViolations} (must be 0)`],
  ["mean rounds to agreement", mean(closed.map((row) => row.rounds)).toFixed(1)],
  ["mean wall-clock per negotiation", `${mean(closed.map((row) => row.ms)).toFixed(0)} ms`],
  ["mean API calls per negotiation", mean(closed.map((row) => row.calls)).toFixed(1)],
  ["mean buyer value at agreement", mean(closed.map((row) => row.buyerValue ?? 0)).toFixed(3)],
  ["mean seller value at agreement", mean(closed.map((row) => row.sellerValue ?? 0)).toFixed(3)],
];
const width = Math.max(...table.map(([label]) => label.length));
for (const [label, value] of table) console.log(`  ${label.padEnd(width)}  ${c.bold}${value}${c.reset}`);

const clean = totalViolations === 0 && closedWithoutZopa === 0;
const better = jangOnFeasible > postedOnFeasible;
console.log(
  `\n${clean ? `${c.green}No constraint violations and no impossible deals.${c.reset}` : `${c.red}Soundness check failed.${c.reset}` }` +
    ` ${better ? `${c.green}Negotiation closed more deals than the posted price.${c.reset}` : `${c.yellow}Negotiation did not beat the posted price in this sample.${c.reset}`}\n`,
);
process.exit(clean ? 0 : 1);
