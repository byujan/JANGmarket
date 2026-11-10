#!/usr/bin/env tsx
/**
 * Does asking owners "which would you rather have" and "what would you do
 * instead" (commit 198ed59) recover what they want better than the old
 * importance sliders and the 0..1 walk-away slider?
 *
 * Each simulated owner is a Claude instance given a hidden true utility, told
 * the way a person knows it: limits, what each term is worth to them in
 * dollars, and a concrete outside offer. The owner answers BOTH questionnaires
 * (stateless calls, so neither sees the other). Every answer becomes a
 * mandate, scored against the truth:
 *
 * - weight order (Kendall tau) and weight error (L1 on normalised weights)
 * - reservation error |r_elicited - r_true|
 * - decision error on 4,000 random packages within the limits: the agent
 *   accepts what the owner would refuse ("bad accept") or refuses what the
 *   owner would take ("missed deal")
 *
 * Hybrids (old weights + new reservation, and the reverse) say which half of
 * the change does the work. "true order + ROC" is the new method's ceiling.
 *
 *   npx tsx scripts/final/elicit-llm.ts --owners=16 [--concurrency=4] [--dry]
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  answerComparison,
  comparisonPackages,
  isComplete,
  nextComparison,
  reservationFromAlternative,
  startRanking,
  weightsFromRanking,
  weightsFromSwings,
} from "../../src/lib/jang/elicit.ts";
import type { Preference, Terms } from "../../src/lib/jang/types.ts";
import { utility } from "../../src/lib/jang/utility.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const N = Number(arg("owners", "16"));
const SEED = Number(arg("seed", "20261108"));
const CONCURRENCY = Number(arg("concurrency", "4"));
const MODEL = process.env.JANG_LLM_MODEL ?? "claude-sonnet-5-5";
const dry = process.argv.includes("--dry");

// The TV buyer's anchors, as in agents/scenarios/tv-clearance.json.
const KEYS = ["price", "deliveryDays", "warrantyMonths", "bundle"] as const;
type Key = (typeof KEYS)[number];
const ANCHORS: Record<Key, { ideal: number; limit: number }> = {
  price: { ideal: 999, limit: 1300 },
  deliveryDays: { ideal: 3, limit: 30 },
  warrantyMonths: { ideal: 36, limit: 12 },
  bundle: { ideal: 1, limit: 0 },
};
const LABEL: Record<Key, string> = { price: "Price", deliveryDays: "Delivery", warrantyMonths: "Warranty", bundle: "Soundbar bundled" };

function fmt(key: string, v: number): string {
  if (key === "price") return `$${v.toLocaleString("en-US")}`;
  if (key === "deliveryDays") return `delivery in ${v} days`;
  if (key === "warrantyMonths") return `${v}-month warranty`;
  return v ? "soundbar included" : "no soundbar";
}
const describe = (t: Terms) => Object.entries(t).map(([k, v]) => fmt(k, v)).join(", ");
const prefsFrom = (w: Record<string, number>): Record<string, Preference> =>
  Object.fromEntries(KEYS.map((k) => [k, { weight: w[k], ideal: ANCHORS[k].ideal, worst: ANCHORS[k].limit }]));

// ---------------------------------------------------------------- seeded owners
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

type Owner = { id: number; weights: Record<Key, number>; batna: Terms; rTrue: number; persona: string };

function makeOwner(id: number): Owner {
  // Dirichlet(1) weights: every ordering and spread equally likely.
  const raw = KEYS.map(() => -Math.log(1 - rand()));
  const sum = raw.reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(KEYS.map((k, i) => [k, raw[i] / sum])) as Record<Key, number>;
  const prefs = prefsFrom(weights);
  let batna: Terms;
  let rTrue: number;
  do {
    batna = {
      price: 999 + 10 * Math.floor(rand() * 31),
      deliveryDays: 3 + Math.floor(rand() * 28),
      warrantyMonths: pick([12, 18, 24, 30, 36]),
      bundle: pick([0, 1]),
    };
    rTrue = utility(batna, { preferences: prefs });
  } while (rTrue < 0.1 || rTrue > 0.65);

  // Dollar value of each term, as a person knows it: (w_k / range_k) / (w_price / range_price).
  const perDollar = weights.price / (ANCHORS.price.limit - ANCHORS.price.ideal);
  const usd = (k: Key, units: number) =>
    Math.round(((weights[k] / Math.abs(ANCHORS[k].ideal - ANCHORS[k].limit)) * units) / perDollar);
  const persona = [
    "You are buying a clearance 65-inch OLED TV for your household.",
    "Your hard limits: you will not pay more than $1,300, will not wait more than 30 days for delivery, and the warranty is at least the manufacturer's 12 months. The best you could hope for is $999, delivery in 3 days, a 36-month warranty and a bundled soundbar.",
    `What things are worth to you, within those limits: getting the TV a week sooner is worth about $${usd("deliveryDays", 7)} to you; each extra 6 months of warranty is worth about $${usd("warrantyMonths", 6)}; a bundled soundbar is worth about $${usd("bundle", 1)}. These trade-offs hold steadily across the range.`,
    `If this negotiation falls through, you will buy from another store that has already offered you: ${describe(batna)}. You would take any deal here that you like at least as much as that offer, and nothing worse.`,
    "You do not think in scores or weights; answer the form the way this person would, honestly and carefully.",
  ].join("\n");
  return { id, weights, batna, rTrue, persona };
}

// ---------------------------------------------------------------- asking Claude
let usd = 0;
async function ask(persona: string, question: string): Promise<string> {
  const response = query({
    prompt: question,
    options: { systemPrompt: persona, model: MODEL, maxTurns: 1, allowedTools: [], permissionMode: "default" },
  });
  let text = "";
  for await (const m of response) {
    if (m.type === "assistant") for (const b of m.message.content) if (b.type === "text") text += b.text;
    if (m.type === "result") usd += (m as any).total_cost_usd ?? 0;
  }
  return text.trim();
}
const json = (s: string) => JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));

const OLD_FORM = `You are filling in a form that sets up a software agent to negotiate this purchase for you.

Section "What your agent may agree to". For each term, how much it matters, on a slider:
1 = barely, 2 = a little, 3 = normally, 4 = a lot, 5 = most of all.
Terms: Price ($999 best, $1,300 limit), Delivery (3 days best, 30 days limit), Warranty (36 months best, 12 months limit), Soundbar bundled (yes best, no limit).

Section "When to walk away". Scored across every term, from 0 at your limits to 1 at everything you asked for. Your agent will refuse any package below this, and JANG enforces that refusal rather than trusting the agent to behave.
Slider: "Walk away below" from 0.00 to 0.80 in steps of 0.05.

Reply with only JSON: {"importance": {"price": n, "deliveryDays": n, "warrantyMonths": n, "bundle": n}, "walkAway": x}`;

const pairQuestion = (a: Terms, b: Terms) =>
  `You are filling in a form that sets up a software agent to negotiate this purchase for you.
"What matters most." Which would you rather have? Everything not mentioned is the same in both.
A: ${describe(a)}
B: ${describe(b)}
Reply with only the letter A or B.`;

const BATNA_FORM = `You are filling in a form that sets up a software agent to negotiate this purchase for you.
"If this falls through." What would you do instead? Describe the best deal you could get elsewhere. Your agent will only agree to something at least as good for you as that.
Fields: price (USD), deliveryDays, warrantyMonths (12-48 in steps of 6), bundle (1 = soundbar included, 0 = not). If you truly have no other option, reply {"none": true}.
Reply with only JSON: {"price": n, "deliveryDays": n, "warrantyMonths": n, "bundle": 0 or 1}`;

// The builder's "How much is each worth to you?" section, as the page shows it.
const SWING_FORM = `You are filling in a form that sets up a software agent to negotiate this purchase for you.
"How much is each worth to you?" The order says what matters more, not how much more. For each term, how much more would you pay to get your best instead of your limit? A rough figure is fine.
- Delivery: 30 days -> 3 days
- Warranty: 12 months -> 36 months
- Soundbar bundled: no -> yes
For scale: your whole price range, $1,300 to $999, is worth $301 to you by definition.
Reply with only JSON, amounts in USD: {"deliveryDays": n, "warrantyMonths": n, "bundle": n}`;

async function runOwner(o: Owner) {
  const old = json(await ask(o.persona, OLD_FORM));
  let state = startRanking([...KEYS]);
  const answers: string[] = [];
  while (!isComplete(state)) {
    const q = nextComparison(state)!;
    const { candidateFirst, againstFirst } = comparisonPackages(q.candidate, q.against, ANCHORS);
    // Randomise which side is A, so a letter bias cannot masquerade as a preference.
    const flip = rand() < 0.5;
    const reply = (await ask(o.persona, pairQuestion(flip ? againstFirst : candidateFirst, flip ? candidateFirst : againstFirst)))
      .toUpperCase()
      .match(/[AB]/)?.[0];
    const choseCandidate = (reply === "A") !== flip;
    answers.push(`${q.candidate} vs ${q.against}: ${choseCandidate ? q.candidate : q.against}`);
    state = answerComparison(state, choseCandidate);
  }
  const alt = json(await ask(o.persona, BATNA_FORM));
  const swings = json(await ask(o.persona, SWING_FORM));
  return { old, ranked: state.ranked, asked: state.asked, answers, alt, swings };
}

// ---------------------------------------------------------------- scoring
const norm = (w: Record<string, number>) => {
  const s = KEYS.reduce((a, k) => a + w[k], 0);
  return Object.fromEntries(KEYS.map((k) => [k, w[k] / s])) as Record<Key, number>;
};
function kendall(a: Record<string, number>, b: Record<string, number>): number {
  let c = 0, d = 0;
  for (let i = 0; i < KEYS.length; i++)
    for (let j = i + 1; j < KEYS.length; j++) {
      const x = Math.sign(a[KEYS[i]] - a[KEYS[j]]) * Math.sign(b[KEYS[i]] - b[KEYS[j]]);
      if (x > 0) c++;
      else if (x < 0) d++;
    }
  return (c - d) / 6; // ties count as neither
}
const sampleRand = rng(SEED + 1);
const SAMPLE: Terms[] = Array.from({ length: 4000 }, () => ({
  price: 999 + 10 * Math.floor(sampleRand() * 31),
  deliveryDays: 3 + Math.floor(sampleRand() * 28),
  warrantyMonths: [12, 18, 24, 30, 36][Math.floor(sampleRand() * 5)],
  bundle: sampleRand() < 0.5 ? 0 : 1,
}));
function score(o: Owner, w: Record<string, number>, r: number) {
  const tp = prefsFrom(o.weights), ep = prefsFrom(w);
  let badAccept = 0, missed = 0, loss = 0, ownerWants = 0;
  for (const t of SAMPLE) {
    const ut = utility(t, { preferences: tp });
    const wants = ut >= o.rTrue, agentTakes = utility(t, { preferences: ep }) >= r;
    if (wants) ownerWants++;
    if (agentTakes && !wants) { badAccept++; loss += o.rTrue - ut; }
    if (!agentTakes && wants) missed++;
  }
  const wn = norm(w);
  return {
    tau: kendall(w, o.weights),
    weightL1: KEYS.reduce((a, k) => a + Math.abs(wn[k] - o.weights[k]), 0),
    rErr: Math.abs(r - o.rTrue),
    badAccept: badAccept / SAMPLE.length,
    missedOfWanted: ownerWants ? missed / ownerWants : 0,
    disagree: (badAccept + missed) / SAMPLE.length,
    lossPerBadAccept: badAccept ? loss / badAccept : 0,
  };
}

// ---------------------------------------------------------------- run
const owners = Array.from({ length: N }, (_, i) => makeOwner(i));
if (dry) {
  console.log(owners[0].persona, "\n\nrTrue", owners[0].rTrue.toFixed(3), owners[0].weights);
  process.exit(0);
}
console.log(`elicitation experiment: ${N} owners, model ${MODEL}, seed ${SEED}`);
const records: any[] = [];
let next = 0;
async function worker() {
  while (next < owners.length) {
    const o = owners[next++];
    try {
      const a = await runOwner(o);
      const oldW = Object.fromEntries(KEYS.map((k) => [k, Number(a.old.importance[k])]));
      const oldR = Number(a.old.walkAway);
      const newW = weightsFromRanking(a.ranked);
      const newR = a.alt.none ? 0 : reservationFromAlternative(a.alt, prefsFrom(newW));
      const moneyW = weightsFromSwings(
        "price",
        Object.fromEntries(KEYS.filter((k) => k !== "price").map((k) => [k, Number(a.swings[k])])),
        ANCHORS,
      ) ?? newW;
      const moneyR = a.alt.none ? 0 : reservationFromAlternative(a.alt, prefsFrom(moneyW));
      const trueOrderW = weightsFromRanking([...KEYS].sort((x, y) => o.weights[y] - o.weights[x]));
      const rec = {
        owner: o.id, trueWeights: o.weights, batna: o.batna, rTrue: o.rTrue, elicited: a,
        arms: {
          old: score(o, oldW, oldR),
          new: score(o, newW, newR),
          "new + money questions": score(o, moneyW, moneyR),
          "old weights + new reservation": score(o, oldW, a.alt.none ? 0 : reservationFromAlternative(a.alt, prefsFrom(oldW))),
          "new weights + old walk-away": score(o, newW, oldR),
          "true order + ROC (ceiling)": score(o, trueOrderW, reservationFromAlternative(o.batna, prefsFrom(trueOrderW))),
        },
      };
      records.push(rec);
      console.log(`owner ${o.id}: rTrue ${o.rTrue.toFixed(2)} | old ${(rec.arms.old.disagree * 100).toFixed(1)}% | new ${(rec.arms.new.disagree * 100).toFixed(1)}% | new+money r ${moneyR.toFixed(2)} ${(rec.arms["new + money questions"].disagree * 100).toFixed(1)}%`);
    } catch (e) {
      console.log(`owner ${o.id}: ERROR ${e}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const arms = Object.keys(records[0]?.arms ?? {});
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`\n${records.length} owners scored, API-equivalent cost $${usd.toFixed(2)}\n`);
console.log("arm".padEnd(32), "tau", "  wL1 ", " |r err|", " bad-accept", " missed", " disagree", " loss/bad");
for (const arm of arms) {
  const s = (k: string) => mean(records.map((r) => r.arms[arm][k]));
  console.log(
    arm.padEnd(32),
    s("tau").toFixed(2), s("weightL1").toFixed(3).padStart(6), s("rErr").toFixed(3).padStart(8),
    `${(s("badAccept") * 100).toFixed(1)}%`.padStart(10), `${(s("missedOfWanted") * 100).toFixed(1)}%`.padStart(7),
    `${(s("disagree") * 100).toFixed(1)}%`.padStart(9), s("lossPerBadAccept").toFixed(3).padStart(9),
  );
}
// Paired: per owner, does the arm beat the old sliders on decision disagreement?
for (const arm of ["new", "new + money questions"]) {
const diffs = records.map((r) => r.arms.old.disagree - r.arms[arm].disagree);
const wins = diffs.filter((d) => d > 1e-9).length, losses = diffs.filter((d) => d < -1e-9).length;
let p = 0;
const n = wins + losses, k = Math.min(wins, losses);
const choose = (a: number, b: number) => { let c = 1; for (let i = 0; i < b; i++) c = (c * (a - i)) / (i + 1); return c; };
for (let i = 0; i <= k; i++) p += choose(n, i) / 2 ** n;
console.log(`paired vs old, ${arm} (old - arm disagreement): mean ${(mean(diffs) * 100).toFixed(1)} pts, better ${wins} / worse ${losses}, sign test p=${Math.min(1, 2 * p).toFixed(4)}`);
}

mkdirSync("results/final", { recursive: true });
const file = `results/final/elicit-llm-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, `${JSON.stringify({ seed: SEED, model: MODEL, owners: N, usd, records }, null, 1)}\n`);
console.log(`wrote ${file}`);
