import postgres, { type Sql } from "postgres";
import type { Agreement, ItemSpec, Mandate, Offer, Session } from "../jang/types.ts";
import type {
  AgentRecord,
  EventRecord,
  OwnerRecord,
  SessionFilter,
  SessionSummary,
  Store,
} from "./types.ts";

/**
 * Postgres-backed storage.
 *
 * Sessions and their offers are written together: a session's offer list is the
 * event stream the live views tail, so offers get their own rows and are
 * appended rather than rewritten.
 */
export class PostgresStore implements Store {
  constructor(private readonly sql: Sql) {}

  static fromUrl(url: string): PostgresStore {
    return new PostgresStore(postgres(url, { onnotice: () => {} }));
  }

  async upsertOwner(owner: OwnerRecord): Promise<void> {
    await this.sql`
      insert into owners (owner_id, clerk_user_id, email, display_name, public_key, created_at)
      values (${owner.ownerId}, ${owner.clerkUserId}, ${owner.email ?? null},
              ${owner.displayName ?? null}, ${owner.publicKey ?? null}, ${owner.createdAt})
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        display_name = excluded.display_name,
        public_key = coalesce(excluded.public_key, owners.public_key)
    `;
  }

  async getOwner(ownerId: string): Promise<OwnerRecord | undefined> {
    const rows = await this.sql`select * from owners where owner_id = ${ownerId}`;
    return rows[0] ? toOwner(rows[0]) : undefined;
  }

  async getOwnerByClerkId(clerkUserId: string): Promise<OwnerRecord | undefined> {
    const rows = await this.sql`select * from owners where clerk_user_id = ${clerkUserId}`;
    return rows[0] ? toOwner(rows[0]) : undefined;
  }

  async createAgent(record: AgentRecord): Promise<void> {
    await this.sql`
      insert into agents (agent_id, owner_id, label, api_key_hash, created_at)
      values (${record.agentId}, ${record.ownerId}, ${record.label ?? null},
              ${record.apiKeyHash}, ${record.createdAt})
    `;
  }

  async getAgent(agentId: string): Promise<AgentRecord | undefined> {
    const rows = await this.sql`select * from agents where agent_id = ${agentId}`;
    return rows[0] ? toAgent(rows[0]) : undefined;
  }

  async getAgentByApiKeyHash(hash: string): Promise<AgentRecord | undefined> {
    const rows = await this.sql`select * from agents where api_key_hash = ${hash}`;
    return rows[0] ? toAgent(rows[0]) : undefined;
  }

  async listAgentsByOwner(ownerId: string): Promise<AgentRecord[]> {
    const rows = await this.sql`
      select * from agents where owner_id = ${ownerId} order by created_at desc
    `;
    return rows.map(toAgent);
  }

  async putMandate(mandate: Mandate): Promise<void> {
    await this.sql`
      insert into mandates (agent_id, item_id, mandate_id, owner_id, role, body)
      values (${mandate.agentId}, ${mandate.itemId}, ${mandate.mandateId},
              ${mandate.ownerId}, ${mandate.role}, ${this.sql.json(mandate)})
      on conflict (agent_id, item_id) do update set
        mandate_id = excluded.mandate_id,
        owner_id = excluded.owner_id,
        role = excluded.role,
        body = excluded.body,
        created_at = now()
    `;
  }

  async getMandate(agentId: string, itemId: string): Promise<Mandate | undefined> {
    const rows = await this.sql`
      select body from mandates where agent_id = ${agentId} and item_id = ${itemId}
    `;
    return rows[0]?.body as Mandate | undefined;
  }

  async listMandatesByOwner(ownerId: string): Promise<Mandate[]> {
    const rows = await this.sql`
      select body from mandates where owner_id = ${ownerId} order by created_at desc
    `;
    return rows.map((row) => row.body as Mandate);
  }

  async putSession(session: Session): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        insert into sessions (session_id, item_spec, buyer_agent_id, seller_agent_id, mandates,
                              status, max_rounds, expires_at, created_at, updated_at,
                              agreement_id, accepted_by)
        values (${session.sessionId}, ${tx.json(session.itemSpec)}, ${session.participants.buyer},
                ${session.participants.seller}, ${tx.json(session.mandates)}, ${session.status},
                ${session.maxRounds}, ${session.expiresAt}, ${session.createdAt}, now(),
                ${session.agreementId ?? null},
                ${session.acceptedBy ? tx.json(session.acceptedBy) : null})
        on conflict (session_id) do update set
          status = excluded.status,
          updated_at = now(),
          agreement_id = excluded.agreement_id,
          accepted_by = excluded.accepted_by
      `;

      for (const offer of session.offers) {
        await tx`
          insert into offers (offer_id, session_id, from_agent_id, round, terms, note, created_at)
          values (${offer.offerId}, ${offer.sessionId}, ${offer.fromAgentId}, ${offer.round},
                  ${tx.json(offer.terms)}, ${offer.note ?? null}, ${offer.createdAt})
          on conflict (offer_id) do nothing
        `;
      }
    });
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const rows = await this.sql`select * from sessions where session_id = ${sessionId}`;
    const row = rows[0];
    if (!row) return undefined;
    const offers = await this.sql`
      select * from offers where session_id = ${sessionId} order by round asc
    `;
    return {
      sessionId: row.session_id,
      itemSpec: row.item_spec as ItemSpec,
      participants: { buyer: row.buyer_agent_id, seller: row.seller_agent_id },
      mandates: row.mandates as Record<string, Mandate>,
      offers: offers.map(toOffer),
      status: row.status,
      maxRounds: row.max_rounds,
      expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      agreementId: row.agreement_id ?? undefined,
      acceptedBy: (row.accepted_by as Session["acceptedBy"]) ?? undefined,
    };
  }

  async listSessions(filter: SessionFilter = {}): Promise<SessionSummary[]> {
    const rows = await this.sql`
      select s.*, (select count(*) from offers o where o.session_id = s.session_id) as rounds
      from sessions s
      where (${filter.status ?? null}::text is null or s.status = ${filter.status ?? null})
        and (${filter.agentIds ?? null}::text[] is null
             or s.buyer_agent_id = any(${filter.agentIds ?? null}::text[])
             or s.seller_agent_id = any(${filter.agentIds ?? null}::text[]))
      order by s.updated_at desc
      limit ${filter.limit ?? 100}
    `;
    return rows.map((row) => ({
      sessionId: row.session_id,
      status: row.status,
      itemId: (row.item_spec as ItemSpec).itemId,
      itemTitle: (row.item_spec as ItemSpec).title,
      buyerAgentId: row.buyer_agent_id,
      sellerAgentId: row.seller_agent_id,
      rounds: Number(row.rounds),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      agreementId: row.agreement_id ?? undefined,
    }));
  }

  async putAgreement(agreement: Agreement): Promise<void> {
    await this.sql`
      insert into agreements (agreement_id, session_id, body)
      values (${agreement.agreementId}, ${agreement.sessionId}, ${this.sql.json(agreement)})
      on conflict (agreement_id) do nothing
    `;
  }

  async getAgreement(agreementId: string): Promise<Agreement | undefined> {
    const rows = await this.sql`select body from agreements where agreement_id = ${agreementId}`;
    return rows[0]?.body as Agreement | undefined;
  }

  async recordEvent(event: EventRecord): Promise<void> {
    await this.sql`
      insert into events (session_id, agent_id, kind, code, message, detail, created_at)
      values (${event.sessionId ?? null}, ${event.agentId ?? null}, ${event.kind},
              ${event.code ?? null}, ${event.message ?? null},
              ${event.detail === undefined ? null : this.sql.json(event.detail as never)},
              ${event.createdAt})
    `;
  }

  async listEvents(filter: { sessionId?: string; limit?: number } = {}): Promise<EventRecord[]> {
    const rows = await this.sql`
      select * from events
      where (${filter.sessionId ?? null}::text is null or session_id = ${filter.sessionId ?? null})
      order by created_at desc
      limit ${filter.limit ?? 100}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      sessionId: row.session_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      kind: row.kind,
      code: row.code ?? undefined,
      message: row.message ?? undefined,
      detail: row.detail ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /** Truncates everything. Only for tests and local resets. */
  async reset(): Promise<void> {
    await this.sql`truncate owners, agents, mandates, sessions, offers, agreements, events cascade`;
  }
}

function toOwner(row: Record<string, unknown>): OwnerRecord {
  return {
    ownerId: row.owner_id as string,
    clerkUserId: row.clerk_user_id as string,
    email: (row.email as string) ?? undefined,
    displayName: (row.display_name as string) ?? undefined,
    publicKey: (row.public_key as string) ?? undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function toAgent(row: Record<string, unknown>): AgentRecord {
  return {
    agentId: row.agent_id as string,
    ownerId: row.owner_id as string,
    label: (row.label as string) ?? undefined,
    apiKeyHash: row.api_key_hash as string,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function toOffer(row: Record<string, unknown>): Offer {
  return {
    offerId: row.offer_id as string,
    sessionId: row.session_id as string,
    fromAgentId: row.from_agent_id as string,
    round: row.round as number,
    terms: row.terms as Offer["terms"],
    note: (row.note as string) ?? undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}
