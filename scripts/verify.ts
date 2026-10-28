#!/usr/bin/env tsx
/**
 * Independent verification of an agreement.
 *
 * This script shares no state with the negotiation: it reads the agreement off
 * disk, re-derives the canonical payload, checks JANG's signature against the
 * public key the server publishes, and re-checks every term against both
 * owners' mandates. It also re-checks each owner's signature on their own
 * mandate, so a tampered mandate cannot be used to wave an agreement through.
 */
import { readFileSync } from "node:fs";
import { auditAgreement } from "../src/lib/jang/agreement.ts";
import { verifyMandate } from "../src/lib/jang/mandate.ts";
import { utility } from "../src/lib/jang/utility.ts";
import { AgreementSchema, MandateSchema, type Agreement, type Mandate } from "../src/lib/jang/types.ts";
import { colour, loadScenario, termsLine } from "./common.ts";

const c = colour;
const path = process.argv[2] ?? ".tmp/last-run.json";

type Artefact = {
  agreement: Agreement;
  jangPublicKey: string;
  mandates: { buyer: Mandate; seller: Mandate };
  scenarioId?: string;
};

let artefact: Artefact;
try {
  artefact = JSON.parse(readFileSync(path, "utf8")) as Artefact;
} catch {
  console.error(`${c.red}Could not read ${path}. Run \`npm run demo\` first.${c.reset}`);
  process.exit(1);
}

const agreement = AgreementSchema.parse(artefact.agreement);
const buyer = MandateSchema.parse(artefact.mandates.buyer);
const seller = MandateSchema.parse(artefact.mandates.seller);
const scenario = loadScenario();

const rows: { label: string; ok: boolean; detail: string }[] = [];
const audit = auditAgreement(agreement, artefact.jangPublicKey, { buyer, seller });

rows.push({
  label: "JANG's signature over the agreed terms verifies",
  ok: audit.signatureValid,
  detail: `${agreement.algorithm}, agreement ${agreement.agreementId}`,
});
rows.push({
  label: "the buyer owner's signature on their own mandate verifies",
  ok: verifyMandate(buyer),
  detail: buyer.mandateId,
});
rows.push({
  label: "the seller owner's signature on their own mandate verifies",
  ok: verifyMandate(seller),
  detail: seller.mandateId,
});
rows.push({
  label: "every agreed term is inside the buyer's authority",
  ok: audit.buyer.ok,
  detail: audit.buyer.violations.map((v) => `${v.dimension}: ${v.reason}`).join("; ") || "no violations",
});
rows.push({
  label: "every agreed term is inside the seller's authority",
  ok: audit.seller.ok,
  detail: audit.seller.violations.map((v) => `${v.dimension}: ${v.reason}`).join("; ") || "no violations",
});

// A deal only counts if both owners came out above the value they set as their
// walk-away point; clearing the hard bounds alone is not enough.
const buyerValue = utility(agreement.terms, buyer);
const sellerValue = utility(agreement.terms, seller);
rows.push({
  label: "both owners ended above their reservation value",
  ok: buyerValue >= buyer.reservationUtility && sellerValue >= seller.reservationUtility,
  detail: `buyer ${buyerValue.toFixed(3)} ≥ ${buyer.reservationUtility}, seller ${sellerValue.toFixed(3)} ≥ ${seller.reservationUtility}`,
});

// The signature must actually be load-bearing: flipping one term must break it.
const tampered = { ...agreement, terms: { ...agreement.terms, price: agreement.terms.price - 100 } };
rows.push({
  label: "altering a term after signing breaks the signature",
  ok: !auditAgreement(tampered, artefact.jangPublicKey, { buyer, seller }).signatureValid,
  detail: "re-checked with the price reduced by $100",
});

console.log(`\n${c.bold}Independent verification of ${agreement.agreementId}${c.reset}`);
console.log(`${c.dim}${termsLine(agreement.terms, scenario.itemSpec.dimensions)}${c.reset}\n`);

for (const row of rows) {
  console.log(`${row.ok ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`}  ${row.label}`);
  console.log(`      ${c.dim}${row.detail}${c.reset}`);
}

const failed = rows.filter((row) => !row.ok);
console.log(
  failed.length === 0
    ? `\n${c.green}${c.bold}All ${rows.length} checks passed. Zero constraint violations.${c.reset}\n`
    : `\n${c.red}${c.bold}${failed.length} of ${rows.length} checks failed.${c.reset}\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
