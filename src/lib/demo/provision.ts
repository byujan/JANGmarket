/**
 * Owner-side setup, done before any agent starts negotiating: register the two
 * agents, lodge each owner's signed mandate with JANG, and open the session.
 *
 * Mandates are lodged separately and each agent only ever holds its own, which
 * is what makes the privacy claim testable rather than decorative.
 */
import { JangClient } from "../client.ts";
import { issueMandate, type Scenario } from "../jang/scenario.ts";
import type { Mandate, Role } from "../jang/types.ts";

export type ProvisionedAgent = {
  role: Role;
  agentId: string;
  apiKey: string;
  mandate: Mandate;
};

export type Provisioned = {
  sessionId: string;
  jangPublicKey: string;
  buyer: ProvisionedAgent;
  seller: ProvisionedAgent;
};

export async function provision(scenario: Scenario, baseUrl: string, suffix = ""): Promise<Provisioned> {
  const health = await new JangClient(baseUrl).health();

  const setUp = async (role: Role): Promise<ProvisionedAgent> => {
    const party = role === "buyer" ? scenario.buyer : scenario.seller;
    const agentId = `${party.agentId}${suffix}`;
    const client = new JangClient(baseUrl);
    const apiKey = await client.registerAgent({ agentId, ownerId: party.ownerId });
    // The agent id is inside the signed body, so the mandate is issued with the
    // final id rather than patched afterwards, which would break the signature.
    const mandate = issueMandate({ ...scenario, [role]: { ...party, agentId } } as Scenario, role);
    await client.lodgeMandate(mandate);
    return { role, agentId, apiKey, mandate };
  };

  const buyer = await setUp("buyer");
  const seller = await setUp("seller");

  // The retailer opens: it is the one with stock to clear.
  const sellerClient = new JangClient(baseUrl, seller.apiKey);
  const session = await sellerClient.openSession({
    counterpartyAgentId: buyer.agentId,
    itemSpec: scenario.itemSpec,
    maxRounds: scenario.maxRounds,
  });

  return { sessionId: session.sessionId, jangPublicKey: health.jangPublicKey, buyer, seller };
}
