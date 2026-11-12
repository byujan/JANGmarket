/**
 * Recording what became of an agreement.
 *
 * Only the two owners named on the agreement may say anything about it, and
 * each speaks only for themselves: there is no way to mark the deal settled on
 * the counterparty's behalf. The agreement itself is never touched, because it
 * is signed.
 */
import { JangError, type Agreement, type Role } from "../jang/types.ts";
import {
  HOUSE_OWNER,
  outcomeOf,
  withMark,
  type Mark,
  type Settlement,
} from "../jang/settlement.ts";
import { store } from "../store/index.ts";

/** Who the two sides of an agreement belong to, as owners rather than agents. */
export async function sidesOf(agreementId: string): Promise<{
  settlement: Settlement;
  itemId: string;
}> {
  const agreement = await store.getAgreement(agreementId);
  if (!agreement) throw new JangError("NOT_FOUND", `no agreement ${agreementId}`);

  const existing = await store.getSettlement(agreementId);
  if (existing) return { settlement: existing, itemId: agreement.itemId };

  // Nothing has been said about this agreement yet, including every agreement
  // signed before settlement existed. The empty record is derived rather than
  // backfilled, so old deals behave like new ones.
  const [buyer, seller] = await Promise.all([
    store.getAgent(agreement.buyerAgentId),
    store.getAgent(agreement.sellerAgentId),
  ]);
  const sides = {
    buyerOwnerId: buyer?.ownerId ?? "",
    sellerOwnerId: seller?.ownerId ?? "",
  };
  return {
    itemId: agreement.itemId,
    settlement: {
      agreementId,
      sessionId: agreement.sessionId,
      ...sides,
      outcome: outcomeOf([], sides),
      marks: [],
      updatedAt: agreement.agreedAt,
    },
  };
}

export async function markSettlement(input: {
  agreementId: string;
  ownerId: string;
  mark: Mark;
  note?: string;
}): Promise<Settlement> {
  const { settlement } = await sidesOf(input.agreementId);
  if (input.ownerId !== settlement.buyerOwnerId && input.ownerId !== settlement.sellerOwnerId) {
    throw new JangError("UNAUTHORIZED", "only the two owners on an agreement may say what became of it");
  }

  const marks = withMark(settlement.marks, {
    ownerId: input.ownerId,
    mark: input.mark,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    at: new Date().toISOString(),
  });
  const updated: Settlement = {
    ...settlement,
    marks,
    outcome: outcomeOf(marks, settlement),
    updatedAt: new Date().toISOString(),
  };
  await store.putSettlement(updated);
  return updated;
}

export type AgreementRow = {
  agreement: Agreement;
  settlement: Settlement;
  itemTitle: string;
  /** The side this owner was on, and who they were across the table from. */
  yourRole: Role;
  counterpartyAgentId: string;
  counterpartyIsHouse: boolean;
};

/**
 * Every agreement one of an owner's agents reached, newest first.
 *
 * Derived from their sessions rather than from a settlements index, so an
 * agreement signed before any of this existed still appears.
 */
export async function agreementsForOwner(ownerId: string, limit = 50): Promise<AgreementRow[]> {
  const agents = await store.listAgentsByOwner(ownerId);
  if (agents.length === 0) return [];
  const mine = new Set(agents.map((agent) => agent.agentId));

  const sessions = (await store.listSessions({ agentIds: [...mine], limit: limit * 2 })).filter(
    (session) => session.status === "agreed" && session.agreementId,
  );
  const [agreements, settlements] = await Promise.all([
    Promise.all(sessions.map((session) => store.getAgreement(session.agreementId!))),
    store.getSettlements(sessions.map((session) => session.agreementId!)),
  ]);
  const byId = new Map(settlements.map((settlement) => [settlement.agreementId, settlement]));

  const rows = await Promise.all(
    sessions.map(async (session, index) => {
      const agreement = agreements[index];
      if (!agreement) return undefined;
      const yourRole: Role = mine.has(session.buyerAgentId) ? "buyer" : "seller";
      const counterpartyAgentId = yourRole === "buyer" ? session.sellerAgentId : session.buyerAgentId;
      const counterparty = await store.getAgent(counterpartyAgentId);
      return {
        agreement,
        settlement: byId.get(agreement.agreementId) ?? (await sidesOf(agreement.agreementId)).settlement,
        itemTitle: session.itemTitle,
        yourRole,
        counterpartyAgentId,
        counterpartyIsHouse: counterparty?.ownerId === HOUSE_OWNER,
      };
    }),
  );
  return rows.filter((row): row is AgreementRow => Boolean(row)).slice(0, limit);
}
