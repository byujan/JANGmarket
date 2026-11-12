/**
 * What an agent connecting from outside can learn about the market.
 *
 * Until this existed, an agent could negotiate but not shop: it had to be
 * handed an item spec and a counterparty id by a person working in the
 * console. Everything here is answered to an agent key, so an agent can find
 * something worth bargaining over and open a session on its own.
 *
 * What it still cannot do is write its own mandate. Discovery widens what an
 * agent can see; it does not widen what it may agree to, which is the whole
 * point of the mandate sitting with the owner.
 */
import {
  catalogue,
  ensureHouseAgent,
  ensureHouseForListing,
  itemSpecOfListing,
  roleFor,
  catalogItem,
  type CatalogueEntry,
} from "./marketplace.ts";
import { JangError, type ItemSpec, type Role } from "../jang/types.ts";
import { store } from "../store/index.ts";

export type MarketItem = {
  itemId: string;
  title: string;
  description?: string;
  /** Which side is yours to take, or undefined when none is. */
  yourRole?: Role;
  /** Whether this agent already holds authority to negotiate over it. */
  youHaveMandate: boolean;
  source: "built-in" | "listed";
  /** Plain English when the item is visible but not yours to negotiate over. */
  closedReason?: string;
  terms: { key: string; label: string; unit?: string; min: number; max: number; step: number }[];
};

const termsOf = (spec: ItemSpec): MarketItem["terms"] =>
  spec.dimensions.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    ...(dimension.unit ? { unit: dimension.unit } : {}),
    min: dimension.min,
    max: dimension.max,
    step: dimension.step,
  }));

async function toMarketItem(entry: CatalogueEntry, agentId: string, ownerId: string): Promise<MarketItem> {
  const itemId = entry.itemSpec.itemId;
  const mine = entry.source !== "listed" || entry.listedBy === ownerId;
  // The house sells in a built-in market, so a visitor buys. On a listing the
  // lister keeps the side they listed.
  const yourRole: Role | undefined = entry.source === "built-in" ? "buyer" : mine ? roleFor(entry, ownerId) : undefined;

  return {
    itemId,
    title: entry.title,
    ...(entry.description ? { description: entry.description } : {}),
    ...(yourRole ? { yourRole } : {}),
    youHaveMandate: Boolean(await store.getMandate(agentId, itemId)),
    source: entry.source,
    ...(yourRole
      ? {}
      : {
          closedReason:
            "another owner listed this, and taking the other side of someone's listing needs the lister themselves " +
            "as counterparty, which is not wired up yet",
        }),
    terms: termsOf(entry.itemSpec),
  };
}

/** Everything on the instance, with this agent's own position on each. */
export async function marketFor(agentId: string, ownerId: string): Promise<MarketItem[]> {
  const entries = await catalogue();
  return Promise.all(entries.map((entry) => toMarketItem(entry, agentId, ownerId)));
}

export type MarketItemDetail = MarketItem & {
  itemSpec: ItemSpec;
  /**
   * Who to name as counterparty when opening a session. Resolving this creates
   * the house agent for the item if it does not exist yet, which is the same
   * thing the console does when someone presses Start negotiating.
   */
  counterpartyAgentId?: string;
  /** What this agent must do next, in order. */
  nextSteps: string[];
};

export async function marketItemFor(
  itemId: string,
  agentId: string,
  ownerId: string,
): Promise<MarketItemDetail> {
  const entries = await catalogue();
  const entry = entries.find((candidate) => candidate.itemSpec.itemId === itemId);
  if (!entry) throw new JangError("NOT_FOUND", `no item ${itemId} on this market`);

  const item = await toMarketItem(entry, agentId, ownerId);
  const itemSpec =
    entry.source === "listed"
      ? itemSpecOfListing((await store.getItem(itemId))!)
      : catalogItem(itemId).itemSpec;

  if (!item.yourRole) {
    return { ...item, itemSpec, nextSteps: ["Nothing: this item is not open to you."] };
  }

  const listing = entry.source === "listed" ? await store.getItem(itemId) : undefined;
  const counterpartyAgentId = listing
    ? await ensureHouseForListing(listing)
    : await ensureHouseAgent(catalogItem(itemId));

  return {
    ...item,
    itemSpec,
    counterpartyAgentId,
    nextSteps: item.youHaveMandate
      ? [
          `Call open_session with counterpartyAgentId "${counterpartyAgentId}" and this itemSpec.`,
          "Then negotiate with offer, counter and accept.",
        ]
      : [
          `Your owner must sign a ${item.yourRole} mandate for this item and lodge it with JANG; ` +
            "you cannot write your own, because a mandate is the authority your owner is granting you. " +
            "They do that from Your limits in the console.",
          `Once it is lodged, call open_session with counterpartyAgentId "${counterpartyAgentId}" and this itemSpec.`,
        ],
  };
}
