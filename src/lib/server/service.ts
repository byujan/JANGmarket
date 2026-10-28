import { createHash, randomUUID } from "node:crypto";
import { buildAgreementBody, signAgreement } from "../jang/agreement.ts";
import { verifyMandate } from "../jang/mandate.ts";
import {
  acceptStandingOffer,
  createSession,
  redactSessionFor,
  submitOffer,
  type SessionView,
} from "../jang/session.ts";
import {
  ItemSpecSchema,
  JangError,
  MandateSchema,
  TermsSchema,
  type Agreement,
  type ItemSpec,
  type Mandate,
  type Role,
  type Terms,
} from "../jang/types.ts";
import { memoryStore } from "../store/memory.ts";
import type { AgentRecord, Store } from "../store/types.ts";
import { jangKeys } from "./keys.ts";

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export class JangService {
  constructor(private readonly store: Store = memoryStore) {}

  get publicKey(): string {
    return jangKeys.publicKeyPem;
  }

  async registerAgent(input: { agentId: string; ownerId: string }): Promise<{ agent: AgentRecord; apiKey: string }> {
    if (await this.store.getAgent(input.agentId)) {
      throw new JangError("UNAUTHORIZED", `agent ${input.agentId} is already registered`);
    }
    const apiKey = `jang_${randomUUID().replace(/-/g, "")}`;
    const agent: AgentRecord = {
      agentId: input.agentId,
      ownerId: input.ownerId,
      apiKeyHash: hashApiKey(apiKey),
      createdAt: new Date().toISOString(),
    };
    await this.store.createAgent(agent);
    return { agent, apiKey };
  }

  async authenticate(apiKey: string | null): Promise<AgentRecord> {
    if (!apiKey) throw new JangError("UNAUTHORIZED", "missing X-Agent-Key header");
    const agent = await this.store.getAgentByApiKeyHash(hashApiKey(apiKey));
    if (!agent) throw new JangError("UNAUTHORIZED", "unknown agent key");
    return agent;
  }

  /**
   * An owner lodges a mandate with JANG directly. It never travels through the
   * counterparty, and JANG checks the owner's signature before storing it.
   */
  async lodgeMandate(agentId: string, raw: unknown): Promise<{ mandateId: string; itemId: string }> {
    const parsed = MandateSchema.safeParse(raw);
    if (!parsed.success) throw new JangError("INVALID_MANDATE", parsed.error.issues[0]?.message ?? "malformed mandate");
    const mandate: Mandate = parsed.data;
    if (mandate.agentId !== agentId) {
      throw new JangError("UNAUTHORIZED", "this mandate empowers a different agent");
    }
    if (!verifyMandate(mandate)) {
      throw new JangError("INVALID_MANDATE", "the owner's signature on this mandate does not verify");
    }
    await this.store.putMandate(mandate);
    return { mandateId: mandate.mandateId, itemId: mandate.itemId };
  }

  async openSession(input: {
    agentId: string;
    counterpartyAgentId: string;
    itemSpec: unknown;
    maxRounds?: number;
    ttlSeconds?: number;
  }): Promise<SessionView> {
    const itemSpec: ItemSpec = ItemSpecSchema.parse(input.itemSpec);

    const mine = await this.store.getMandate(input.agentId, itemSpec.itemId);
    if (!mine) throw new JangError("INVALID_MANDATE", "lodge your own mandate for this item before opening a session");
    const theirs = await this.store.getMandate(input.counterpartyAgentId, itemSpec.itemId);
    if (!theirs) {
      throw new JangError("INVALID_MANDATE", `${input.counterpartyAgentId} has not lodged a mandate for ${itemSpec.itemId} yet`);
    }
    if (mine.role === theirs.role) {
      throw new JangError("INVALID_MANDATE", `both agents hold a ${mine.role} mandate; a session needs one of each`);
    }

    const byRole = (role: Role) => (mine.role === role ? mine.agentId : theirs.agentId);
    const session = createSession({
      sessionId: `sess_${randomUUID()}`,
      itemSpec,
      buyerAgentId: byRole("buyer"),
      sellerAgentId: byRole("seller"),
      mandates: [mine, theirs],
      maxRounds: input.maxRounds,
      ttlSeconds: input.ttlSeconds,
    });
    await this.store.putSession(session);
    return redactSessionFor(input.agentId, session);
  }

  async viewSession(agentId: string, sessionId: string): Promise<SessionView> {
    return redactSessionFor(agentId, await this.loadSession(sessionId));
  }

  async makeOffer(input: { agentId: string; sessionId: string; terms: unknown; note?: string }): Promise<SessionView> {
    const session = await this.loadSession(input.sessionId);
    const terms: Terms = TermsSchema.parse(input.terms);
    const { session: next } = submitOffer(session, input.agentId, terms, {
      note: input.note,
      offerId: `offer_${randomUUID()}`,
    });
    await this.store.putSession(next);
    return redactSessionFor(input.agentId, next);
  }

  /** Accepting the standing offer closes the session and mints a signed agreement. */
  async accept(input: { agentId: string; sessionId: string }): Promise<{ view: SessionView; agreement: Agreement }> {
    const session = await this.loadSession(input.sessionId);
    const { session: accepted, offer } = acceptStandingOffer(session, input.agentId);

    const agreement = signAgreement(
      buildAgreementBody({
        agreementId: `agr_${randomUUID()}`,
        session: accepted,
        offer,
        acceptedByAgentId: input.agentId,
      }),
      jangKeys.privateKeyPem,
      jangKeys.publicKeyPem,
    );

    const closed = { ...accepted, agreementId: agreement.agreementId };
    await this.store.putAgreement(agreement);
    await this.store.putSession(closed);
    return { view: redactSessionFor(input.agentId, closed), agreement };
  }

  async getAgreement(agreementId: string): Promise<Agreement> {
    const agreement = await this.store.getAgreement(agreementId);
    if (!agreement) throw new JangError("NOT_FOUND", `no agreement ${agreementId}`);
    return agreement;
  }

  private async loadSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new JangError("NOT_FOUND", `no session ${sessionId}`);
    return session;
  }
}

export const jang = new JangService();
