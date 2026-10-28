import type { Agreement, Mandate, Session } from "../jang/types.ts";
import type { AgentRecord, Store } from "./types.ts";

export class MemoryStore implements Store {
  private agents = new Map<string, AgentRecord>();
  private agentsByKey = new Map<string, string>();
  private mandates = new Map<string, Mandate>();
  private sessions = new Map<string, Session>();
  private agreements = new Map<string, Agreement>();

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

  async putMandate(mandate: Mandate): Promise<void> {
    this.mandates.set(`${mandate.agentId}::${mandate.itemId}`, mandate);
  }

  async getMandate(agentId: string, itemId: string): Promise<Mandate | undefined> {
    return this.mandates.get(`${agentId}::${itemId}`);
  }

  async putSession(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async putAgreement(agreement: Agreement): Promise<void> {
    this.agreements.set(agreement.agreementId, agreement);
  }

  async getAgreement(agreementId: string): Promise<Agreement | undefined> {
    return this.agreements.get(agreementId);
  }

  async reset(): Promise<void> {
    this.agents.clear();
    this.agentsByKey.clear();
    this.mandates.clear();
    this.sessions.clear();
    this.agreements.clear();
  }
}

/**
 * One store per process. Phase 0's demo runs a single Next.js dev server, so
 * both agents see the same state; Phase 1 replaces this with Postgres before
 * anything is deployed to more than one instance.
 */
const globalForStore = globalThis as unknown as { __jangStore?: MemoryStore };
export const memoryStore: MemoryStore = (globalForStore.__jangStore ??= new MemoryStore());
