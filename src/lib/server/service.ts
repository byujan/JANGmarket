import { createHash, randomUUID } from "node:crypto";
import type { Posture } from "../posture.ts";
import { buildAgreementBody, signAgreement } from "../jang/agreement.ts";
import type { DilemmaPoint } from "../jang/analysis.ts";
import type { Market } from "../jang/types.ts";
import { bestImprovement, quality, sessionFrontier } from "../jang/frontier.ts";
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
  type Session,
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

  async registerAgent(input: {
    agentId: string;
    ownerId: string;
    label?: string;
    posture?: Posture;
    brief?: string;
  }): Promise<{ agent: AgentRecord; apiKey: string }> {
    if (await this.store.getAgent(input.agentId)) {
      throw new JangError("UNAUTHORIZED", `agent ${input.agentId} is already registered`);
    }
    const apiKey = `jang_${randomUUID().replace(/-/g, "")}`;
    const agent: AgentRecord = {
      agentId: input.agentId,
      ownerId: input.ownerId,
      label: input.label,
      ...(input.posture ? { posture: input.posture } : {}),
      ...(input.brief ? { brief: input.brief } : {}),
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
    await this.note({ kind: "session_opened", sessionId: session.sessionId, agentId: input.agentId, ...this.feasibility(session, itemSpec.itemId) });
    return redactSessionFor(input.agentId, session);
  }

  async viewSession(agentId: string, sessionId: string): Promise<SessionView> {
    return this.withMarket(agentId, await this.loadSession(sessionId));
  }

  /**
   * A redacted view, plus what this agent may know about the contest for the
   * item: its own remaining allowance, and how many negotiations are running.
   * Neither figure comes from the counterparty's mandate.
   */
  private async withMarket(agentId: string, session: Session): Promise<SessionView> {
    const view = redactSessionFor(agentId, session);
    try {
      return { ...view, market: await this.marketFor(agentId, session.itemSpec.itemId) };
    } catch {
      return view;
    }
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

    // A mandate authorises a quantity as well as a package. Checked at the
    // moment of acceptance for both sides, because nothing is spent before
    // then: an agent may hold many negotiations open and close only what its
    // owner allowed it to.
    for (const participant of [session.participants.buyer, session.participants.seller]) {
      await this.assertSupplyRemains(session, participant);
    }

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
    await this.note({
      kind: "agreed",
      sessionId: session.sessionId,
      agentId: input.agentId,
      detail: { agreementId: agreement.agreementId, terms: agreement.terms, quality: this.dealQuality(closed, agreement) },
    });
    return { view: redactSessionFor(input.agentId, closed), agreement };
  }

  /**
   * Whether any deal is possible at all, for the operator's log only. The
   * agents are deliberately not told: if they were, an agent could re-lodge
   * its own mandate with different limits, reopen, and binary-search the
   * counterparty's limit from the yes/no. The session runs as usual.
   */
  private feasibility(session: Session, itemId: string): Pick<EventRecord, "code" | "message" | "detail"> {
    try {
      const truth = sessionFrontier(session);
      const possible = truth.feasible.length > 0;
      return {
        ...(possible
          ? {}
          : { code: "NO_POSSIBLE_DEAL", message: "no package satisfies both mandates; this session cannot close (agents not told)" }),
        detail: { itemId, possibleDeal: possible, feasiblePackages: truth.feasible.length, frontierSize: truth.frontier.length },
      };
    } catch {
      return { detail: { itemId } };
    }
  }

  /**
   * How good the deal was against everything these two owners could have
   * agreed: an operator's number, recorded in the event log and never in the
   * signed agreement or any agent's view, since it is derived from both
   * private mandates. A failure here must never undo a closed deal.
   */
  private dealQuality(session: Session, agreement: Agreement) {
    try {
      const truth = sessionFrontier(session);
      const buyer = session.mandates[session.participants.buyer];
      const seller = session.mandates[session.participants.seller];
      const q = quality(agreement.terms, buyer, seller, truth);
      // What JANG could have proposed before signing, had it been allowed to
      // speak. Recorded for the operator; never offered to the agents.
      const better = bestImprovement(agreement.terms, buyer, seller, truth);
      return {
        efficiency: Number(q.efficiency.toFixed(4)),
        paretoOptimal: q.paretoOptimal,
        paretoDistance: Number(q.paretoDistance.toFixed(4)),
        buyerShare: Number(q.buyerShare.toFixed(4)),
        ...(better
          ? {
              missedImprovement: {
                terms: better.terms,
                buyerGain: Number(better.buyerGain.toFixed(4)),
                sellerGain: Number(better.sellerGain.toFixed(4)),
              },
            }
          : {}),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Readings of every closed negotiation, for the operator's charts. Derived
   * from both private mandates, so it is never offered to an agent and never
   * reaches an owner's own view of a session.
   */
  async operatorReadings(limit = 60): Promise<DilemmaPoint[]> {
    const summaries = await this.store.listSessions({ status: "agreed", limit });
    const points: DilemmaPoint[] = [];

    for (const summary of summaries) {
      const session = await this.store.getSession(summary.sessionId);
      if (!session?.agreementId) continue;
      const agreement = await this.store.getAgreement(session.agreementId);
      if (!agreement) continue;

      try {
        const truth = sessionFrontier(session);
        const q = quality(
          agreement.terms,
          session.mandates[session.participants.buyer],
          session.mandates[session.participants.seller],
          truth,
        );
        points.push({
          sessionId: session.sessionId,
          itemTitle: session.itemSpec.title,
          created: Number.isFinite(q.efficiency) ? Math.max(0, Math.min(1, q.efficiency)) : 0,
          claimed: Number.isFinite(q.buyerShare) ? Math.max(0, Math.min(1, q.buyerShare)) : 0,
          paretoOptimal: q.paretoOptimal,
        });
      } catch {
        // A session whose lattice will not build is left out rather than
        // allowed to take the whole board down with it.
      }
    }
    return points;
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

  /**
   * Refuse an acceptance that would commit an owner past the quantity their
   * mandate allows. Absent a supply the allowance is one, which is what a
   * single clearance television means.
   */
  private async assertSupplyRemains(session: Session, agentId: string): Promise<void> {
    const mandate = session.mandates[agentId];
    if (!mandate) return;
    const allowed = mandate.supply ?? 1;
    // This session is still open, so it is not among the committed.
    const { committed } = await this.store.marketState(agentId, session.itemSpec.itemId);

    if (committed >= allowed) {
      const verb = mandate.role === "seller" ? "sell" : "buy";
      const error = new JangError(
        "SUPPLY_EXHAUSTED",
        `${agentId} has already agreed ${committed} of the ${allowed} its owner authorised it to ${verb}`,
      );
      await this.note({
        kind: "refusal",
        sessionId: session.sessionId,
        agentId,
        code: error.code,
        message: error.message,
      });
      throw error;
    }
  }

  /** What an agent may be told about how contested its item is. */
  async marketFor(agentId: string, itemId: string): Promise<Market> {
    const [state, mandate] = await Promise.all([
      this.store.marketState(agentId, itemId),
      this.store.getMandate(agentId, itemId),
    ]);
    const authorised = mandate?.supply ?? 1;
    return {
      remaining: Math.max(0, authorised - state.committed),
      authorised,
      openSessions: state.openSessions,
    };
  }

  private async loadSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new JangError("NOT_FOUND", `no session ${sessionId}`);
    return session;
  }
}

export const jang = new JangService();
