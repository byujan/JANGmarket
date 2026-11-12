/**
 * How hard an owner's own agent bargains.
 *
 * This is not authority. A mandate says what an agent may agree to and JANG
 * enforces it; posture only says how quickly the agent gives ground inside
 * those limits. An aggressive agent and an amenable one hold the same
 * mandate and can sign the same deals, they just arrive differently.
 *
 * It is a dial rather than a sentence because the built-in negotiator is a
 * concession schedule, not a prompt: it has somewhere to put a number and
 * nowhere to put an adjective. The free-text brief beside it is the opposite,
 * and goes to agents that do read prose.
 */
export const POSTURES = ["amenable", "balanced", "firm", "aggressive"] as const;

export type Posture = (typeof POSTURES)[number];

export const DEFAULT_POSTURE: Posture = "firm";

/**
 * The exponent on the concession schedule: `target = ceiling - (ceiling -
 * floor) * elapsed^toughness`. Below 1 the agent gives ground early, at 1 it
 * concedes in a straight line, and above 1 it holds near its best outcome and
 * moves late.
 *
 * `firm` is what the console already did before posture existed, so an agent
 * registered without one behaves exactly as it used to.
 */
const TOUGHNESS: Record<Posture, number> = {
  amenable: 0.6,
  balanced: 1,
  firm: 1.6,
  aggressive: 2.6,
};

export function toughnessOf(posture: Posture | undefined): number {
  return TOUGHNESS[posture ?? DEFAULT_POSTURE];
}

export function isPosture(value: unknown): value is Posture {
  return typeof value === "string" && (POSTURES as readonly string[]).includes(value);
}

/** How each choice is put to the owner, in the order they should read them. */
export const POSTURE_COPY: Record<Posture, { label: string; blurb: string }> = {
  amenable: {
    label: "Amenable",
    blurb: "Concedes early and settles quickly. Takes a worse deal rather than risk no deal.",
  },
  balanced: {
    label: "Balanced",
    blurb: "Gives ground at a steady rate across the session.",
  },
  firm: {
    label: "Firm",
    blurb: "Holds out for most of the session, then moves. What JANG has always done.",
  },
  aggressive: {
    label: "Aggressive",
    blurb:
      "Barely moves until the end. Against a counterparty that also holds out this can backfire, " +
      "leaving it to take a late, worse deal rather than none.",
  },
};
