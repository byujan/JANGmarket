import { z } from "zod";
import { generateKeyPair } from "./crypto.ts";
import { signMandate } from "./mandate.ts";
import {
  ConstraintSchema,
  ItemSpecSchema,
  PreferenceSchema,
  RoleSchema,
  TermsSchema,
  type Mandate,
  type Role,
} from "./types.ts";

/**
 * A scenario is the market-design input to a negotiation: what is being traded,
 * what each owner authorises, and what the same trade would look like at a
 * fixed take-it-or-leave-it price. These files are data, validated here, so
 * they can be edited without touching the engine.
 */
export const PartySchema = z.object({
  agentId: z.string().min(1),
  ownerId: z.string().min(1),
  role: RoleSchema,
  persona: z.string().min(1),
  constraints: z.record(z.string(), ConstraintSchema),
  preferences: z.record(z.string(), PreferenceSchema),
  reservationUtility: z.number().min(0).max(1),
  /** Opt in to sharing this party's priority order with the counterparty. */
  disclosePriorities: z.boolean().optional(),
});
export type Party = z.infer<typeof PartySchema>;

export const ScenarioSchema = z
  .object({
    scenarioId: z.string().min(1),
    title: z.string().min(1),
    itemSpec: ItemSpecSchema,
    buyer: PartySchema,
    seller: PartySchema,
    /** The seller's posted price: what a buyer agent faces without negotiation. */
    fixedPriceBaseline: z.object({ label: z.string().min(1), terms: TermsSchema }),
    maxRounds: z.number().int().positive().max(100).default(20),
    mandateTtlSeconds: z.number().int().positive().default(3600),
  })
  .superRefine((scenario, ctx) => {
    if (scenario.buyer.role !== "buyer" || scenario.seller.role !== "seller") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "the buyer party must have role 'buyer' and the seller 'seller'" });
    }
    const keys = new Set(scenario.itemSpec.dimensions.map((d) => d.key));
    for (const [name, party] of [["buyer", scenario.buyer], ["seller", scenario.seller]] as const) {
      for (const key of [...Object.keys(party.constraints), ...Object.keys(party.preferences)]) {
        if (!keys.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} references "${key}", which is not a dimension of this item` });
        }
      }
    }
    for (const dimension of scenario.itemSpec.dimensions) {
      if (scenario.fixedPriceBaseline.terms[dimension.key] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `fixedPriceBaseline is missing the "${dimension.key}" term` });
      }
    }
  });
export type Scenario = z.infer<typeof ScenarioSchema>;

export function parseScenario(raw: unknown): Scenario {
  return ScenarioSchema.parse(raw);
}

export function partyOf(scenario: Scenario, role: Role): Party {
  return role === "buyer" ? scenario.buyer : scenario.seller;
}

/**
 * Turn a party's declared authority into a signed mandate.
 *
 * The owner keypair is generated here because this is a prototype harness; a
 * real owner would hold their key and sign offline. JANG only ever sees the
 * public key and the signature, which is the part that matters for the model.
 */
export function issueMandate(scenario: Scenario, role: Role, now = new Date()): Mandate {
  const party = partyOf(scenario, role);
  const owner = generateKeyPair();
  return signMandate(
    {
      mandateId: `mdt_${scenario.scenarioId}_${role}`,
      agentId: party.agentId,
      ownerId: party.ownerId,
      role,
      itemId: scenario.itemSpec.itemId,
      constraints: party.constraints,
      preferences: party.preferences,
      reservationUtility: party.reservationUtility,
      expiresAt: new Date(now.getTime() + scenario.mandateTtlSeconds * 1000).toISOString(),
      ...(party.disclosePriorities ? { disclosePriorities: true } : {}),
    },
    owner.privateKeyPem,
    owner.publicKeyPem,
  );
}
