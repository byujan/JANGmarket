import { notFound } from "next/navigation";
import { ConvergenceLadder } from "@/components/ConvergenceLadder.tsx";
import { MandateBuilder } from "@/components/MandateBuilder.tsx";
import { GettingStarted } from "@/components/GettingStarted.tsx";
import { OperationsBoard } from "@/components/OperationsBoard.tsx";
import type { Dimension, Offer } from "@/lib/jang/types.ts";
import type { EventRecord, SessionSummary } from "@/lib/store/types.ts";

export const dynamic = "force-dynamic";

/**
 * Every component on one page, with fixture data, so the interface can be
 * looked at without signing in or running a negotiation.
 *
 * Development only: the signed-in surfaces are the hardest part of this app to
 * see, and designing them blind is how they drifted in the first place.
 */
const dimensions: Dimension[] = [
  { key: "price", label: "Price", unit: "USD", min: 500, max: 3000, step: 10, buyerPrefers: "low" },
  { key: "deliveryDays", label: "Delivery", unit: "days", min: 1, max: 45, step: 1, buyerPrefers: "low" },
  { key: "warrantyMonths", label: "Warranty", unit: "months", min: 0, max: 48, step: 6, buyerPrefers: "high" },
  { key: "bundle", label: "Soundbar", min: 0, max: 1, step: 1, buyerPrefers: "high" },
];

const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function offer(round: number, from: string, terms: number[], note?: string, alts?: number[][]): Offer {
  const pack = (t: number[]) => ({
    price: t[0],
    deliveryDays: t[1],
    warrantyMonths: t[2],
    bundle: t[3],
  });
  return {
    offerId: `o${round}`,
    sessionId: "sess_preview",
    fromAgentId: from,
    round,
    terms: pack(terms),
    note,
    createdAt: at(12 - round),
    ...(alts ? { alternatives: alts.map((a, i) => ({ offerId: `o${round}a${i}`, terms: pack(a) })) } : {}),
  };
}

const offers: Offer[] = [
  offer(1, "seller", [1349, 30, 0, 0], "Opening proposal. Tell me which terms matter most."),
  offer(2, "buyer", [999, 2, 48, 1], "I cannot take that package as it stands."),
  offer(3, "seller", [1310, 26, 12, 0], "I have moved toward you on warranty.", [[1330, 14, 6, 0]]),
  offer(4, "buyer", [1080, 8, 42, 1], "We are still apart on price."),
  offer(5, "seller", [1250, 20, 30, 0], "I can extend the warranty instead of cutting price."),
  offer(6, "buyer", [1200, 18, 36, 0], "That works for me on every term."),
];

const sessions: SessionSummary[] = [
  { sessionId: "sess_a1b2c3", status: "open", itemId: "item-tv-65oled", itemTitle: "Clearance 65-inch OLED television", buyerAgentId: "buyer-nova", sellerAgentId: "house-item-tv-65oled", rounds: 6, createdAt: at(9), updatedAt: at(1) },
  { sessionId: "sess_d4e5f6", status: "agreed", itemId: "item-cambridge-1br", itemTitle: "Cambridge apartment lease", buyerAgentId: "buyer-nova", sellerAgentId: "house-item-cambridge-1br", rounds: 10, createdAt: at(40), updatedAt: at(22), agreementId: "agr_77" },
  { sessionId: "sess_g7h8i9", status: "agreed", itemId: "item-tv-65oled", itemTitle: "Clearance 65-inch OLED television", buyerAgentId: "buyer-atlas", sellerAgentId: "house-item-tv-65oled", rounds: 8, createdAt: at(70), updatedAt: at(61), agreementId: "agr_76" },
  { sessionId: "sess_j1k2l3", status: "expired", itemId: "item-tv-65oled", itemTitle: "Clearance 65-inch OLED television", buyerAgentId: "buyer-atlas", sellerAgentId: "house-item-tv-65oled", rounds: 12, createdAt: at(120), updatedAt: at(104) },
];

const events: EventRecord[] = [
  { id: "1", kind: "offer", sessionId: "sess_a1b2c3", agentId: "buyer-nova", detail: { round: 6 }, createdAt: at(1) },
  { id: "2", kind: "refusal", sessionId: "sess_a1b2c3", agentId: "house-item-tv-65oled", code: "MANDATE_VIOLATION", message: "below the minimum allowed", detail: [{ dimension: "price", limit: 1050 }], createdAt: at(3) },
  { id: "3", kind: "agreed", sessionId: "sess_d4e5f6", agentId: "buyer-nova", createdAt: at(22) },
  { id: "4", kind: "refusal", sessionId: "sess_j1k2l3", agentId: "buyer-atlas", code: "ROUND_LIMIT", message: "reached its limit of 12 offers", createdAt: at(104) },
  { id: "5", kind: "session_opened", sessionId: "sess_a1b2c3", agentId: "house-item-tv-65oled", createdAt: at(9) },
];

export default function Preview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Interface preview</h1>
        <p>
          Every component with fixture data, so the signed-in surfaces can be looked at without an account. This page
          does not exist outside development.
        </p>
      </div>

      <section className="section">
        <h2>Convergence ladder</h2>
        <ConvergenceLadder dimensions={dimensions} offers={offers} buyerAgentId="buyer" agreedOfferId="o6" />
      </section>

      <section className="section">
        <h2>Getting started, at step two</h2>
        <GettingStarted progress={{ agents: 1, mandates: 0, negotiations: 0 }} />
      </section>

      <section className="section">
        <h2>Limits builder, as a sheet</h2>
        <div className="sheet">
          <MandateBuilder
            items={[{ itemSpec: { itemId: "item-tv-65oled", title: "Clearance 65-inch OLED television", dimensions }, title: "Clearance 65-inch OLED television" }]}
            agents={[{ agentId: "buyer-nova", label: "Buys household electronics" }]}
            ownerId="own_preview"
          />
        </div>
      </section>

      <section className="section">
        <h2>Operations board</h2>
        <OperationsBoard
          initial={{
            sessions,
            events,
            counts: { open: 1, agreed: 2, expired: 1, failed: 0, total: 4 },
            refusals: 2,
            at: new Date().toISOString(),
          }}
        />
      </section>
    </main>
  );
}
