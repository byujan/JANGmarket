import type { Agreement, Mandate, Session } from "../jang/types.ts";
import type {
  AgentRecord,
  EventRecord,
  ItemRecord,
  OwnerRecord,
  MarketState,
  SessionCounts,
  SessionFilter,
  SessionSummary,
  Store,
} from "./types.ts";

/** Process-local storage. Correct for a single-process demo, wrong for anything else. */
export class MemoryStore implements Store {
  private owners = new Map<string, OwnerRecord>();
  private agents = new Map<string, AgentRecord>();
  private agentsByKey = new Map<string, string>();
  private mandates = new Map<string, Mandate>();
  private sessions = new Map<string, Session>();
  private agreements = new Map<string, Agreement>();
  private items = new Map<string, ItemRecord>();
  private events: EventRecord[] = [];

  async upsertOwner(owner: OwnerRecord): Promise<void> {
    const existing = this.owners.get(owner.ownerId);
    // A bound signing key outlives later profile updates, which do not carry
    // one. Losing it would quietly disable the key check on the next mandate.
    this.owners.set(owner.ownerId, {
      ...existing,
      ...owner,
      publicKey: owner.publicKey ?? existing?.publicKey,
      createdAt: existing?.createdAt ?? owner.createdAt,
    });
  }

  async getOwner(ownerId: string): Promise<OwnerRecord | undefined> {
    return this.owners.get(ownerId);
  }

  async getOwnerByClerkId(clerkUserId: string): Promise<OwnerRecord | undefined> {
    return [...this.owners.values()].find((owner) => owner.clerkUserId === clerkUserId);
  }

  async createAgent(record: AgentRecord): Promise<void> {
    this.agents.set(record.agentId, record);
    this.agentsByKey.set(record.apiKeyHash, record.agentId);
  }

  async getAgent(agentId: string): Promise<AgentRecord | undefined> {
    return this.agents.get(agentId);
  }

  async getAgentByApiKeyHash(hash: string): Promise<AgentRecord | undefined> {
    const agentId = this.agentsByKey.get(hash);
    return agentId ? this.agents.get(agentId) : undefined;
  }

  async listAgentsByOwner(ownerId: string): Promise<AgentRecord[]> {
    return [...this.agents.values()]
      .filter((agent) => agent.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putMandate(mandate: Mandate): Promise<void> {
    this.mandates.set(`${mandate.agentId}::${mandate.itemId}`, mandate);
  }

  async getMandate(agentId: string, itemId: string): Promise<Mandate | undefined> {
    return this.mandates.get(`${agentId}::${itemId}`);
  }

  async listMandatesByOwner(ownerId: string): Promise<Mandate[]> {
    return [...this.mandates.values()].filter((mandate) => mandate.ownerId === ownerId);
  }

  async putSession(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async listSessions(filter: SessionFilter = {}): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .filter((session) => !filter.status || session.status === filter.status)
      .filter(
        (session) =>
          !filter.agentIds ||
          filter.agentIds.includes(session.participants.buyer) ||
          filter.agentIds.includes(session.participants.seller),
      )
      .sort((a, b) => (summaryTime(b) ?? "").localeCompare(summaryTime(a) ?? ""))
      .slice(0, filter.limit ?? 100)
      .map(toSummary);
  }

  async countSessions(filter: { agentIds?: string[] } = {}): Promise<SessionCounts> {
    const counts: SessionCounts = { open: 0, agreed: 0, expired: 0, failed: 0, total: 0 };
    for (const session of this.sessions.values()) {
      if (
        filter.agentIds &&
        !filter.agentIds.includes(session.participants.buyer) &&
        !filter.agentIds.includes(session.participants.seller)
      ) {
        continue;
      }
      counts[session.status] += 1;
      counts.total += 1;
    }
    return counts;
  }

  async marketState(agentId: string, itemId: string): Promise<MarketState> {
    let committed = 0;
    let openSessions = 0;
    for (const session of this.sessions.values()) {
      const involved = session.participants.buyer === agentId || session.participants.seller === agentId;
      if (!involved || session.itemSpec.itemId !== itemId) continue;
      if (session.status === "agreed") committed += 1;
      else if (session.status === "open") openSessions += 1;
    }
    return { committed, openSessions };
  }

  async putAgreement(agreement: Agreement): Promise<void> {
    this.agreements.set(agreement.agreementId, agreement);
  }

  async getAgreement(agreementId: string): Promise<Agreement | undefined> {
    return this.agreements.get(agreementId);
  }

  async putItem(item: ItemRecord): Promise<void> {
    this.items.set(item.itemId, item);
  }

  async getItem(itemId: string): Promise<ItemRecord | undefined> {
    return this.items.get(itemId);
  }

  async listItems(filter: { ownerId?: string; limit?: number } = {}): Promise<ItemRecord[]> {
    return [...this.items.values()]
      .filter((item) => !filter.ownerId || item.ownerId === filter.ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 100);
  }

  async recordEvent(event: EventRecord): Promise<void> {
    this.events.push({ ...event, id: String(this.events.length + 1) });
  }

  async listEvents(filter: { sessionId?: string; limit?: number } = {}): Promise<EventRecord[]> {
    return this.events
      .filter((event) => !filter.sessionId || event.sessionId === filter.sessionId)
      .slice(-(filter.limit ?? 100))
      .reverse();
  }

  async countEvents(filter: { kind?: EventRecord["kind"] } = {}): Promise<number> {
    return this.events.filter((event) => !filter.kind || event.kind === filter.kind).length;
  }

  async reset(): Promise<void> {
    this.owners.clear();
    this.agents.clear();
    this.agentsByKey.clear();
    this.mandates.clear();
    this.sessions.clear();
    this.agreements.clear();
    this.items.clear();
    this.events = [];
  }
}

function summaryTime(session: Session): string {
  return session.offers.at(-1)?.createdAt ?? session.createdAt;
}

function toSummary(session: Session): SessionSummary {
  return {
    sessionId: session.sessionId,
    status: session.status,
    itemId: session.itemSpec.itemId,
    itemTitle: session.itemSpec.title,
    buyerAgentId: session.participants.buyer,
    sellerAgentId: session.participants.seller,
    rounds: session.offers.length,
    createdAt: session.createdAt,
    updatedAt: summaryTime(session),
    agreementId: session.agreementId,
  };
}
