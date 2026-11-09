import { generateKeyPair } from "./crypto.ts";
import { signMandate } from "./mandate.ts";
import type { ItemSpec, Mandate, MandateBody, Role } from "./types.ts";

export const testItemSpec: ItemSpec = {
  itemId: "item-tv-65oled",
  title: "65-inch OLED television (clearance)",
  dimensions: [
    { key: "price", label: "Price", unit: "USD", min: 500, max: 3000, step: 10 },
    { key: "deliveryDays", label: "Delivery", unit: "days", min: 1, max: 45, step: 1 },
    { key: "warrantyMonths", label: "Warranty", unit: "months", min: 0, max: 48, step: 6 },
    { key: "bundle", label: "Soundbar bundled", min: 0, max: 1, step: 1 },
  ],
};

export function makeMandate(
  overrides: Partial<MandateBody> & { role: Role; agentId: string },
): Mandate {
  const keys = generateKeyPair();
  const body: MandateBody = {
    mandateId: `mandate-${overrides.agentId}`,
    ownerId: `owner-of-${overrides.agentId}`,
    itemId: testItemSpec.itemId,
    constraints: {},
    preferences: {},
    reservationUtility: 0,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
  return signMandate(body, keys.privateKeyPem, keys.publicKeyPem);
}

/** A buyer with a hard $1,500 ceiling who wants it soon, covered, and bundled. */
export function buyerMandate(overrides: Partial<MandateBody> = {}): Mandate {
  return makeMandate({
    agentId: "agent-buyer",
    role: "buyer",
    constraints: { price: { max: 1500 }, deliveryDays: { max: 30 } },
    preferences: {
      price: { weight: 5, ideal: 900, worst: 1500 },
      deliveryDays: { weight: 2, ideal: 2, worst: 30 },
      warrantyMonths: { weight: 2, ideal: 36, worst: 0 },
      bundle: { weight: 1, ideal: 1, worst: 0 },
    },
    reservationUtility: 0.3,
    ...overrides,
  });
}

/** A seller with a hard $1,180 floor who would rather ship late than discount. */
export function sellerMandate(overrides: Partial<MandateBody> = {}): Mandate {
  return makeMandate({
    agentId: "agent-seller",
    role: "seller",
    constraints: { price: { min: 1180 }, warrantyMonths: { max: 36 } },
    preferences: {
      price: { weight: 5, ideal: 1900, worst: 1180 },
      deliveryDays: { weight: 2, ideal: 30, worst: 2 },
      warrantyMonths: { weight: 2, ideal: 0, worst: 36 },
      bundle: { weight: 1, ideal: 0, worst: 1 },
    },
    reservationUtility: 0.3,
    ...overrides,
  });
}
