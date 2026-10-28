import type { Agreement, Mandate, Session } from "../jang/types.ts";

export type AgentRecord = {
  agentId: string;
  ownerId: string;
  apiKeyHash: string;
  createdAt: string;
};

/**
 * Everything JANG persists. Phase 0 runs this in memory inside a single
 * process; a Postgres implementation slots in behind the same interface.
 */
export interface Store {
  createAgent(record: AgentRecord): Promise<void>;
  getAgent(agentId: string): Promise<AgentRecord | undefined>;
  getAgentByApiKeyHash(hash: string): Promise<AgentRecord | undefined>;

  /** Mandates are keyed by the agent they empower and the item they cover. */
  putMandate(mandate: Mandate): Promise<void>;
  getMandate(agentId: string, itemId: string): Promise<Mandate | undefined>;

  putSession(session: Session): Promise<void>;
  getSession(sessionId: string): Promise<Session | undefined>;

  putAgreement(agreement: Agreement): Promise<void>;
  getAgreement(agreementId: string): Promise<Agreement | undefined>;

  reset(): Promise<void>;
}
