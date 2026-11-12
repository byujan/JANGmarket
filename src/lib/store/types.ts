import type { Agreement, Dimension, Mandate, Role, Session } from "../jang/types.ts";
import type { Posture } from "../posture.ts";
import type { Settlement } from "../jang/settlement.ts";

/** A person who signs in and delegates authority to agents. */
export type OwnerRecord = {
  ownerId: string;
  clerkUserId: string;
  email?: string;
  displayName?: string;
  /** Ed25519 SPKI PEM. The private half is generated in the browser. */
  publicKey?: string;
  createdAt: string;
};

export type AgentRecord = {
  agentId: string;
  ownerId: string;
  label?: string;
  /** How hard this agent bargains inside its mandate. See lib/posture.ts. */
  posture?: Posture;
  /** Free text the owner wrote for agents that read prose rather than numbers. */
  brief?: string;
  apiKeyHash: string;
  createdAt: string;
};

/** Enough of a session to list it without loading every offer. */
export type SessionSummary = {
  sessionId: string;
  status: Session["status"];
  itemId: string;
  itemTitle: string;
  buyerAgentId: string;
  sellerAgentId: string;
  rounds: number;
  createdAt: string;
  updatedAt: string;
  agreementId?: string;
};

/**
 * Something worth showing an operator. A refusal is the system working, so it
 * is recorded rather than only logged.
 */
export type EventRecord = {
  id?: string;
  sessionId?: string;
  agentId?: string;
  kind: "refusal" | "session_opened" | "offer" | "agreed";
  code?: string;
  message?: string;
  detail?: unknown;
  createdAt: string;
};

export type SessionFilter = {
  /** Only sessions involving one of these agents. */
  agentIds?: string[];
  status?: Session["status"];
  limit?: number;
};

/**
 * Everything JANG persists. The in-memory implementation keeps local demos a
 * one-command affair; Postgres backs anything with accounts behind it.
 */
/** Totals across everything stored, not across one page of results. */
export type SessionCounts = { open: number; agreed: number; expired: number; failed: number; total: number };

/**
 * How contested one item is, from one agent's side of it.
 *
 * `committed` counts deals this agent has already closed on the item, which is
 * what a supply limit is spent on. `openSessions` counts negotiations still
 * running for it, which is what makes a limited supply urgent.
 */
export type MarketState = { committed: number; openSessions: number };

/**
 * An item an owner listed, with the terms they are willing to negotiate over.
 * The scenario files that ship with the project are the other source; these
 * are the ones people create.
 */
export type ItemRecord = {
  itemId: string;
  ownerId: string;
  title: string;
  description?: string;
  /** The side the person listing it takes; the other side is open to anyone. */
  listedRole: Role;
  dimensions: Dimension[];
  createdAt: string;
};

export interface Store {
  upsertOwner(owner: OwnerRecord): Promise<void>;
  getOwner(ownerId: string): Promise<OwnerRecord | undefined>;
  getOwnerByClerkId(clerkUserId: string): Promise<OwnerRecord | undefined>;

  createAgent(record: AgentRecord): Promise<void>;
  getAgent(agentId: string): Promise<AgentRecord | undefined>;
  getAgentByApiKeyHash(hash: string): Promise<AgentRecord | undefined>;
  listAgentsByOwner(ownerId: string): Promise<AgentRecord[]>;

  /** Mandates are keyed by the agent they empower and the item they cover. */
  putMandate(mandate: Mandate): Promise<void>;
  getMandate(agentId: string, itemId: string): Promise<Mandate | undefined>;
  listMandatesByOwner(ownerId: string): Promise<Mandate[]>;

  putSession(session: Session): Promise<void>;
  getSession(sessionId: string): Promise<Session | undefined>;
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
  /**
   * Counts over every matching session. Deriving these from listSessions would
   * count only the page it returned, which is how a windowed number ends up
   * presented as a total.
   */
  countSessions(filter?: { agentIds?: string[] }): Promise<SessionCounts>;
  /** Deals closed and negotiations running, for one agent on one item. */
  marketState(agentId: string, itemId: string): Promise<MarketState>;

  putAgreement(agreement: Agreement): Promise<void>;
  getAgreement(agreementId: string): Promise<Agreement | undefined>;

  /** What the two owners say became of an agreement. See jang/settlement.ts. */
  putSettlement(settlement: Settlement): Promise<void>;
  getSettlement(agreementId: string): Promise<Settlement | undefined>;
  getSettlements(agreementIds: string[]): Promise<Settlement[]>;

  putItem(item: ItemRecord): Promise<void>;
  getItem(itemId: string): Promise<ItemRecord | undefined>;
  listItems(filter?: { ownerId?: string; limit?: number }): Promise<ItemRecord[]>;

  recordEvent(event: EventRecord): Promise<void>;
  listEvents(filter?: { sessionId?: string; limit?: number }): Promise<EventRecord[]>;
  countEvents(filter?: { kind?: EventRecord["kind"] }): Promise<number>;

  reset(): Promise<void>;
}

export type { Role };
