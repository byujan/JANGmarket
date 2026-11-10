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
import { store as defaultStore } from "../store/index.ts";
import type { AgentRecord, EventRecord, Store } from "../store/types.ts";
import { jangKeys } from "./keys.ts";

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export class JangService {
  constructor(private readonly store: Store = defaultStore) {}

  get publicKey(): string {
    return jangKeys.publicKeyPem;
  }

  async registerAgent(input: { agentId: string; ownerId: string; label?: string }): Promise<{ agent: AgentRecord; apiKey: string }> {
    if (await this.store.getAgent(input.agentId)) {
      throw new JangError("UNAUTHORIZED", `agent ${input.agentId} is already registered`);
    }
    const apiKey = `jang_${randomUUID().replace(/-/g, "")}`;
    const agent: AgentRecord = {
      agentId: input.agentId,
      ownerId: input.ownerId,
      label: input.label,
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
    await this.note({ kind: "session_opened", sessionId: session.sessionId, agentId: input.agentId, detail: { itemId: itemSpec.itemId } });
    return redactSessionFor(input.agentId, session);
  }

  async viewSession(agentId: string, sessionId: string): Promise<SessionView> {
    return redactSessionFor(agentId, await this.loadSession(sessionId));
  }

  async makeOffer(input: {
    agentId: string;
    sessionId: string;
    terms: unknown;
    /** MESO: up to two more packages offered in the same turn. */
    alternatives?: unknown[];
    note?: string;
  }): Promise<SessionView> {
    const session = await this.loadSession(input.sessionId);
    const terms: Terms = TermsSchema.parse(input.terms);
    // JANG mints every package's id, so an agent cannot collide with or
    // impersonate another offer by choosing its own.
    const alternatives = (input.alternatives ?? []).map((raw) => ({
      offerId: `offer_${randomUUID()}`,
      terms: TermsSchema.parse(raw),
    }));
    const { session: next, offer } = await this.recording(input, () =>
      submitOffer(session, input.agentId, terms, {
        note: input.note,
        offerId: `offer_${randomUUID()}`,
        alternatives: alternatives.length > 0 ? alternatives : undefined,
      }),
    );
    await this.store.putSession(next);
    await this.note({
      kind: "offer",
      sessionId: session.sessionId,
      agentId: input.agentId,
      detail: { round: offer.round, terms: offer.terms, ...(offer.alternatives ? { alternatives: offer.alternatives } : {}) },
    });
    return redactSessionFor(input.agentId, next);
  }

  /** Accepting the standing offer closes the session and mints a signed agreement. */
  async accept(input: {
    agentId: string;
    sessionId: string;
    /** Which package to accept. Required when the standing offer has alternatives. */
    offerId?: string;
  }): Promise<{ view: SessionView; agreement: Agreement }> {
    const session = await this.loadSession(input.sessionId);
    const { session: accepted, offer } = await this.recording(input, () =>
      acceptStandingOffer(session, input.agentId, { offerId: input.offerId }),
    );

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
    await this.note({ kind: "agreed", sessionId: session.sessionId, agentId: input.agentId, detail: { agreementId: agreement.agreementId, terms: agreement.terms } });
    return { view: redactSessionFor(input.agentId, closed), agreement };
  }

  async getAgreement(agreementId: string): Promise<Agreement> {
    const agreement = await this.store.getAgreement(agreementId);
    if (!agreement) throw new JangError("NOT_FOUND", `no agreement ${agreementId}`);
    return agreement;
  }

  /**
   * Run a domain operation, and keep any refusal. A blocked offer is the
   * system working as designed, so an operator should be able to see it.
   */
  private async recording<T>(
    context: { agentId: string; sessionId: string },
    operation: () => T,
  ): Promise<T> {
    try {
      return operation();
    } catch (error) {
      if (error instanceof JangError) {
        await this.note({
          kind: "refusal",
          sessionId: context.sessionId,
          agentId: context.agentId,
          code: error.code,
          message: error.message,
          detail: error.violations,
        });
      }
      throw error;
    }
  }

  private async note(event: Omit<EventRecord, "createdAt">): Promise<void> {
    try {
      await this.store.recordEvent({ ...event, createdAt: new Date().toISOString() });
    } catch {
      // Never let bookkeeping break a negotiation.
    }
  }

  private async loadSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new JangError("NOT_FOUND", `no session ${sessionId}`);
    return session;
  }
}

export const jang = new JangService();
