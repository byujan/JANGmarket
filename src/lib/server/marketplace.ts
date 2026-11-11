/**
 * The marketplace around the negotiation engine: what is on offer, who the
 * counterparty is, and how a negotiation gets started from a web page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runRuleAgent } from "../../../agents/runner.ts";
import { ServicePort } from "../../../agents/service-port.ts";
import { issueMandate, parseScenario, type Scenario } from "../jang/scenario.ts";
import { houseMandateBody, opposite } from "../jang/listing.ts";
import { signMandate } from "../jang/mandate.ts";
import { generateKeyPair } from "../jang/crypto.ts";
import type { ItemRecord } from "../store/types.ts";
import { JangError, type ItemSpec, type Role } from "../jang/types.ts";
import { store } from "../store/index.ts";
import { jang } from "./service.ts";

const SCENARIO_DIR = join(process.cwd(), "agents", "scenarios");

/** Every item a signed-in owner can negotiate over, read from the scenario files. */
export function catalog(): Scenario[] {
  return readdirSync(SCENARIO_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => parseScenario(JSON.parse(readFileSync(join(SCENARIO_DIR, name), "utf8"))))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Everything negotiable: the scenario files that ship with the project, and
 * the items people listed. A listing has no written counterparty, so one is
 * derived from its declared ranges when a negotiation starts.
 */
export type CatalogueEntry = {
  itemSpec: ItemSpec;
  title: string;
  description?: string;
  /** The side the lister took. Built-in markets leave this unset. */
  listedRole?: Role;
  source: "built-in" | "listed";
  listedBy?: string;
};

/**
 * Which side of an item a given owner takes.
 *
 * Whoever listed it keeps the side they listed: a person selling a bike
 * negotiates as the seller, not as a buyer of their own bike. Anyone else
 * takes the side left open. A built-in market has the house selling, so a
 * visitor buys.
 */
export function roleFor(entry: CatalogueEntry, ownerId: string): Role | undefined {
  if (entry.source !== "listed" || !entry.listedRole) return undefined;
  return entry.listedBy === ownerId ? entry.listedRole : opposite(entry.listedRole);
}

export async function catalogue(forOwnerId?: string): Promise<CatalogueEntry[]> {
  const built = catalog().map((scenario) => ({
    itemSpec: scenario.itemSpec,
    title: scenario.title,
    description: scenario.itemSpec.description,
    source: "built-in" as const,
  }));

  const listed = (await store.listItems({ ownerId: forOwnerId, limit: 200 })).map((item) => ({
    itemSpec: itemSpecOfListing(item),
    title: item.title,
    description: item.description,
    listedRole: item.listedRole,
    source: "listed" as const,
    listedBy: item.ownerId,
  }));

  return [...listed, ...built];
}

export function itemSpecOfListing(item: ItemRecord): ItemSpec {
  return {
    itemId: item.itemId,
    title: item.title,
    description: item.description,
    dimensions: item.dimensions,
  };
}

/** The spec for anything negotiable, listed or built in. */
export async function specFor(itemId: string): Promise<ItemSpec> {
  const listed = await store.getItem(itemId);
  if (listed) return itemSpecOfListing(listed);
  return catalogItem(itemId).itemSpec;
}

export function catalogItem(itemId: string): Scenario {
  const found = catalog().find((scenario) => scenario.itemSpec.itemId === itemId);
  if (!found) throw new JangError("NOT_FOUND", `no item ${itemId} in the catalogue`);
  return found;
}

export function itemSpecOf(itemId: string): ItemSpec {
  return catalogItem(itemId).itemSpec;
}

const HOUSE_OWNER = "jang-house";

/**
 * The counterparty an owner negotiates against.
 *
 * A marketplace needs two sides, and a new owner has only one. The house agent
 * is a real agent under a real signed mandate, getting no special treatment
 * from the engine, so that a single person can run an honest negotiation.
 */
/**
 * The house's agent for an item somebody listed. Its position comes from the
 * item's ranges, never from the lister's mandate, so it is a real counterparty
 * rather than an echo.
 */
export async function ensureHouseForListing(item: ItemRecord): Promise<string> {
  const agentId = `house-${item.itemId}`;
  if (!(await store.getAgent(agentId))) {
    await jang.registerAgent({ agentId, ownerId: HOUSE_OWNER, label: `House side of ${item.title}` });
  }

  if (!(await store.getMandate(agentId, item.itemId))) {
    const keys = generateKeyPair();
    const body = houseMandateBody({
      itemSpec: itemSpecOfListing(item),
      listedRole: item.listedRole,
      agentId,
      ownerId: HOUSE_OWNER,
      mandateId: `mdt_house_${item.itemId}`,
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      supply: 10_000,
    });
    await store.putMandate(signMandate(body, keys.privateKeyPem, keys.publicKeyPem));
  }
  return agentId;
}

export async function ensureHouseAgent(scenario: Scenario): Promise<string> {
  const agentId = `house-${scenario.itemSpec.itemId}`;
  const existing = await store.getAgent(agentId);

  if (!existing) {
    const { apiKey } = await jang.registerAgent({ agentId, ownerId: HOUSE_OWNER });
    void apiKey; // The house is driven in-process; its key is never handed out.
  }

  if (!(await store.getMandate(agentId, scenario.itemSpec.itemId))) {
    // The house is a stand-in so that one person can negotiate alone, not a
    // real warehouse. It is authorised generously on purpose: a supply of one,
    // which is what an absent supply means, would let it sell once and then
    // refuse every console demo afterwards. Real inventory belongs to real
    // sellers, whose scenarios declare it.
    const mandate = issueMandate(
      { ...scenario, seller: { ...scenario.seller, agentId, supply: scenario.seller.supply ?? 10_000 } },
      "seller",
    );
    await store.putMandate(mandate);
  }

  return agentId;
}

export type LaunchResult = { sessionId: string };

/**
 * Open a session between an owner's agent and the house, then let both sides
 * negotiate in the background so the page can watch it happen.
 */
export async function launchNegotiation(input: {
  ownerId: string;
  agentId: string;
  itemId: string;
}): Promise<LaunchResult> {
  const agent = await store.getAgent(input.agentId);
  if (!agent || agent.ownerId !== input.ownerId) {
    throw new JangError("UNAUTHORIZED", "that agent does not belong to you");
  }

  const listing = await store.getItem(input.itemId);
  const scenario = listing ? undefined : catalogItem(input.itemId);
  const itemSpec = listing ? itemSpecOfListing(listing) : scenario!.itemSpec;
  const mine = await store.getMandate(input.agentId, input.itemId);
  if (!mine) {
    throw new JangError("INVALID_MANDATE", "issue a mandate for this item before starting a negotiation");
  }
  // Whoever listed it keeps the side they listed. A built-in market has the
  // house selling, so a visitor buys.
  const expected: Role = listing
    ? listing.ownerId === input.ownerId
      ? listing.listedRole
      : opposite(listing.listedRole)
    : "buyer";
  if (mine.role !== expected) {
    throw new JangError(
      "INVALID_MANDATE",
      `this item needs a ${expected} mandate from you, and your agent holds a ${mine.role} one`,
    );
  }

  const houseAgentId = listing ? await ensureHouseForListing(listing) : await ensureHouseAgent(scenario!);
  const view = await jang.openSession({
    agentId: houseAgentId,
    counterpartyAgentId: input.agentId,
    itemSpec,
    maxRounds: scenario?.maxRounds ?? 12,
    ttlSeconds: 900,
  });

  void autoplay(view.sessionId, input.agentId, houseAgentId);
  return { sessionId: view.sessionId };
}

/**
 * Drive both agents to a conclusion in the background, slowly enough that a
 * person watching the live view can follow the bargaining.
 */
export async function autoplay(sessionId: string, buyerAgentId: string, sellerAgentId: string): Promise<void> {
  const thinkMs = Number(process.env.JANG_AUTOPLAY_DELAY_MS ?? 1200);
  try {
    await Promise.all([
      runRuleAgent({
        label: "seller",
        agent: new ServicePort(jang, sellerAgentId, sessionId),
        options: { toughness: 1.6 },
        thinkMs,
        pollMs: 200,
      }),
      runRuleAgent({
        label: "buyer",
        agent: new ServicePort(jang, buyerAgentId, sessionId),
        options: { toughness: 1.5 },
        thinkMs,
        pollMs: 200,
      }),
    ]);
  } catch (error) {
    await store.recordEvent({
      kind: "refusal",
      sessionId,
      code: "AUTOPLAY_FAILED",
      message: error instanceof Error ? error.message : String(error),
      createdAt: new Date().toISOString(),
    });
  }
}
