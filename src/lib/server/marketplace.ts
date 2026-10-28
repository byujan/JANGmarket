/**
 * The marketplace around the negotiation engine: what is on offer, who the
 * counterparty is, and how a negotiation gets started from a web page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runRuleAgent } from "../../../agents/runner.ts";
import { ServicePort } from "../../../agents/service-port.ts";
import { issueMandate, parseScenario, type Scenario } from "../jang/scenario.ts";
import { JangError, type ItemSpec } from "../jang/types.ts";
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
 * is a real agent under a real signed mandate — it gets no special treatment
 * from the engine — so that a single person can run an honest negotiation.
 */
export async function ensureHouseAgent(scenario: Scenario): Promise<string> {
  const agentId = `house-${scenario.itemSpec.itemId}`;
  const existing = await store.getAgent(agentId);

  if (!existing) {
    const { apiKey } = await jang.registerAgent({ agentId, ownerId: HOUSE_OWNER });
    void apiKey; // The house is driven in-process; its key is never handed out.
  }

  if (!(await store.getMandate(agentId, scenario.itemSpec.itemId))) {
    const mandate = issueMandate({ ...scenario, seller: { ...scenario.seller, agentId } }, "seller");
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

  const scenario = catalogItem(input.itemId);
  const mine = await store.getMandate(input.agentId, input.itemId);
  if (!mine) {
    throw new JangError("INVALID_MANDATE", "issue a mandate for this item before starting a negotiation");
  }
  if (mine.role !== "buyer") {
    throw new JangError("INVALID_MANDATE", "the house takes the seller side, so your agent needs a buyer mandate");
  }

  const houseAgentId = await ensureHouseAgent(scenario);
  const view = await jang.openSession({
    agentId: houseAgentId,
    counterpartyAgentId: input.agentId,
    itemSpec: scenario.itemSpec,
    maxRounds: scenario.maxRounds,
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
