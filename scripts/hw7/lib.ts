/**
 * HW7 benchmark harness: market generators, ground truth, and an in-process
 * negotiation runner.
 *
 * Everything here is deliberately outside the engine. The engine is exercised
 * exactly as an agent sees it (JangService + the same NegotiationPort the REST
 * and MCP doors use); ground truth is computed by exhaustive search over the
 * term lattice, so neither "a deal was possible" nor "this deal was efficient"
 * is the negotiator's own opinion.
 */
import { runRuleAgent } from "../../agents/runner.ts";
import { ServicePort } from "../../agents/service-port.ts";
import { auditAgreement } from "../../src/lib/jang/agreement.ts";
import { checkTermsAgainstMandate } from "../../src/lib/jang/mandate.ts";
import { groundTruth as frontierGroundTruth, type GroundTruth } from "../../src/lib/jang/frontier.ts";
import { issueMandate, type Scenario } from "../../src/lib/jang/scenario.ts";
import type { Mandate, Terms } from "../../src/lib/jang/types.ts";
import { utility } from "../../src/lib/jang/utility.ts";
import { JangService } from "../../src/lib/server/service.ts";
import { MemoryStore } from "../../src/lib/store/memory.ts";

// ---------------------------------------------------------------- randomness

/** Deterministic PRNG so every reported number can be reproduced exactly. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- markets

export type CaseName = "ordinary" | "narrow" | "asymmetric" | "nozopa";
export const CASES: CaseName[] = ["ordinary", "narrow", "asymmetric", "nozopa"];
export const CASE_SIZE: Record<CaseName, number> = { ordinary: 40, narrow: 40, asymmetric: 40, nozopa: 20 };

/** Agent toughness per case. Asymmetric uses the ordinary markets with a much harder seller. */
export const TOUGHNESS: Record<CaseName, { buyer: number; seller: number }> = {
  ordinary: { buyer: 1.5, seller: 1.6 },
  narrow: { buyer: 1.5, seller: 1.6 },
  asymmetric: { buyer: 1.5, seller: 4.0 },
  nozopa: { buyer: 1.5, seller: 1.6 },
};

/**
 * One market. The generation rule is fixed before any result is inspected:
 * - ordinary:   the original benchmark's variant(), unchanged
 * - narrow:     buyer ceiling is $0-$50 above the seller floor
 * - asymmetric: the ordinary markets themselves (only agent toughness differs)
 * - nozopa:     buyer ceiling is $10-$200 below the seller floor
 */
export function makeMarket(base: Scenario, kind: CaseName, seed: number, index: number): Scenario {
  // Asymmetric reuses ordinary's markets so the only difference is the agent.
  const stream = kind === "asymmetric" ? "ordinary" : kind;
  const rng = mulberry32(seed * 31 + CASES.indexOf(stream as CaseName) * 100_003 + index * 7919);
  const between = (low: number, high: number, step = 1) => Math.round((low + rng() * (high - low)) / step) * step;

  const floor = between(1000, 1400, 10);
  let ceiling = between(1150, 1750, 10);
  if (kind === "narrow") ceiling = floor + between(0, 50, 10);
  if (kind === "nozopa") ceiling = floor - between(10, 200, 10);
  const posted = between(Math.max(floor + 50, 1250), 1850, 10);

  return {
    ...base,
    scenarioId: `${base.scenarioId}-${kind}-s${seed}-${index}`,
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
      terms: { price: posted, deliveryDays: 14, warrantyMonths: 12, bundle: 0 },
    },
  };
}

/**
 * The baseline: the same market with every non-price term pinned to the posted
 * defaults, in BOTH owners' mandates. The engine then enforces "price only" the
 * same way it enforces any other limit, so the rule agent and a Claude agent
 * face exactly the same restriction. Preferences and reservation values are
 * untouched, so utilities stay comparable.
 */
export function priceOnly(market: Scenario): Scenario {
  const fixed = market.fixedPriceBaseline.terms;
  const pin = (constraints: Scenario["buyer"]["constraints"]) => {
    const next = { ...constraints };
    for (const dimension of market.itemSpec.dimensions) {
      if (dimension.key === "price") continue;
      next[dimension.key] = { min: fixed[dimension.key], max: fixed[dimension.key] };
    }
    return next;
  };
  return {
    ...market,
    scenarioId: `${market.scenarioId}-priceonly`,
    buyer: { ...market.buyer, constraints: pin(market.buyer.constraints) },
    seller: { ...market.seller, constraints: pin(market.seller.constraints) },
  };
}

// ---------------------------------------------------------------- ground truth

// The exhaustive search now lives in the product (src/lib/jang/frontier.ts);
// HW7 calls the same code, so its numbers and the product's cannot drift.
export { quality, type GroundTruth, type Point, type Quality } from "../../src/lib/jang/frontier.ts";

export function groundTruth(buyer: Mandate, seller: Mandate, market: Scenario): GroundTruth {
  return frontierGroundTruth(market.itemSpec, buyer, seller);
}

// ---------------------------------------------------------------- negotiation

export type StrategyKnobs = {
  buyer: number;
  seller: number;
  deadlineAware?: boolean;
  respectBounds?: boolean;
  meso?: boolean;
  /** Which owners share their priority order with the other side. */
  disclose?: { buyer?: boolean; seller?: boolean };
};

export type Outcome = {
  agreed: boolean;
  terms?: Terms;
  rounds: number;
  apiCalls: number;
  ms: number;
  violations: number;
  stoppedBecause?: string;
};

/**
 * One negotiation between two rule agents, in process. A fresh JangService and
 * memory store per call, so nothing leaks between markets.
 */
export async function negotiate(market: Scenario, knobs: StrategyKnobs, maxRounds = market.maxRounds): Promise<Outcome & { buyer: Mandate; seller: Mandate }> {
  const service = new JangService(new MemoryStore());
  const disclosing = {
    ...market,
    buyer: { ...market.buyer, disclosePriorities: knobs.disclose?.buyer || undefined },
    seller: { ...market.seller, disclosePriorities: knobs.disclose?.seller || undefined },
  };
  const buyer = issueMandate(disclosing, "buyer");
  const seller = issueMandate(disclosing, "seller");
  await service.registerAgent({ agentId: buyer.agentId, ownerId: buyer.ownerId });
  await service.registerAgent({ agentId: seller.agentId, ownerId: seller.ownerId });
  await service.lodgeMandate(buyer.agentId, buyer);
  await service.lodgeMandate(seller.agentId, seller);
  const opened = await service.openSession({
    agentId: seller.agentId,
    counterpartyAgentId: buyer.agentId,
    itemSpec: market.itemSpec,
    maxRounds,
  });

  const sellerPort = new ServicePort(service, seller.agentId, opened.sessionId);
  const buyerPort = new ServicePort(service, buyer.agentId, opened.sessionId);
  // When one agent walks away (or the session closes) the other must not wait
  // forever for a reply that will never come: once either run ends, the other
  // agent's next read fails and its runner stops.
  let finished = false;
  let firstStop: string | undefined;
  const guard = (port: ServicePort) => ({
    get callCount() {
      return port.callCount;
    },
    getSession: () => (finished ? Promise.reject(new Error("counterparty left")) : port.getSession()),
    offer: (terms: Terms, note: string, alternatives?: Terms[]) => port.offer(terms, note, alternatives),
    accept: (offerId?: string) => port.accept(offerId),
  });
  const run = (label: string, port: ServicePort, toughness: number) =>
    runRuleAgent({
      label,
      agent: guard(port),
      options: { toughness, deadlineAware: knobs.deadlineAware, respectBounds: knobs.respectBounds, meso: knobs.meso },
      pollMs: 0,
      maxTurns: 1_000_000,
    }).then((result) => {
      if (!finished && result.stoppedBecause) firstStop = `${label}: ${result.stoppedBecause}`;
      finished = true;
      return result;
    });
  const started = performance.now();
  const [sellerRun, buyerRun] = await Promise.all([run("seller", sellerPort, knobs.seller), run("buyer", buyerPort, knobs.buyer)]);
  const ms = performance.now() - started;

  const agreement = sellerRun.agreement ?? buyerRun.agreement;
  const view = await service.viewSession(buyer.agentId, opened.sessionId);
  let violations = 0;
  if (agreement) {
    const audit = auditAgreement(agreement, service.publicKey, { buyer, seller });
    violations = (audit.signatureValid ? 0 : 1) + audit.buyer.violations.length + audit.seller.violations.length;
  }
  return {
    agreed: Boolean(agreement),
    terms: agreement?.terms,
    rounds: view.roundsUsed,
    apiCalls: sellerPort.callCount + buyerPort.callCount,
    ms,
    violations,
    stoppedBecause: agreement ? undefined : firstStop,
    buyer,
    seller,
  };
}

/** A posted take-it-or-leave-it package sells only if it clears both mandates unchanged. */
export function clears(terms: Terms, buyer: Mandate, seller: Mandate): boolean {
  return checkTermsAgainstMandate(terms, buyer).ok && checkTermsAgainstMandate(terms, seller).ok;
}
