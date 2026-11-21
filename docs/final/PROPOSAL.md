# Proposal: make JANG negotiate, not just match

Hendrick, 7 November 2026. **Nothing is implemented and no code has changed.** Stages 1
and 2 are in the negotiation core, so section 9 is the list of things I need you to
decide before I write anything.

> **The point in one paragraph.** Anyone can match a buyer agent to a seller agent.
> Discovery is solved and payment rails are being solved. What makes JANG different is
> that it **negotiates on their behalf**. So far we have built a safe board to negotiate
> on: authority enforced, nothing leaked, outcomes signed. The negotiating itself is still
> thin, and HW7 measured exactly how thin. This proposes four standard negotiation
> techniques to close that gap. All of them opt-in, none of them touching the core.

### The argument in five lines

| | |
| --- | --- |
| JANG reaches deals a price-only market cannot. | HW7 Claim A: **81% against 53%. Proven.** |
| JANG does not make those deals better for both sides. | HW7 Claim B: **0.80 against 0.84. Not proven.** |
| Why: our agents never learn what the other side wants. | `distanceToTheirAsk` weights every term equally. |
| Fix: four techniques any negotiation course teaches. | MESO, priority disclosure, BATNA, Pareto frontier. |
| Biggest risk: 12 rounds may be too few for stage 1. | Which is why stage 1 goes first. |

### What changes, at a glance

| Stage | In one line | Size | Needs you |
| --- | --- | --- | --- |
| **1. MESO** | Offer three equivalent packages instead of one, let them choose | Large | **Yes** |
| **2. Priority disclosure** | Publish the order of what matters, never the numbers | Medium | **Yes** |
| **3. BATNA elicitation** | Ask "what will you do instead", stop asking for 0.30 | Medium | No |
| **4. Pareto frontier** | Move it out of the benchmark and into the product | Small | No |

---

## 1. Why this is the thing to work on

Our moat is not the matching. It is that **JANG is the only party that sees both sides'
authority at once.** That position lets us do two things no counterparty agent can do:

1. **Leave no waste on the table.** Find the package where neither side can gain without
   the other losing.
2. **Keep the split from collapsing onto one side.** Stop one party taking everything.

HW7 says we already get the second one. Buyer share of the surplus is **0.55 under JANG
against 0.27 price-only**. The negotiation protects the weaker position.

HW7 also says we do not get the first one. That is the gap this proposal goes after.

Right now we use our privileged position only to **enforce**. We never use it to
**improve**. That is the whole idea in one sentence.

---

## 2. Where we are

```
                 owner (browser)
                       |  signs a mandate, private key never leaves
                       v
   agent  --MCP-->  mcp/server.ts  --HTTP+key-->  src/app/api/*
                                                       |
                                                       v
                                           src/lib/jang/*   mandate check,
                                                       |    session, signing
                                                       v
                                           src/lib/store/*  memory | Postgres
```

One round today:

```
   agent A                    JANG                     agent B
      |   offer(terms)          |                          |
      |------------------------>|                          |
      |         check terms against A's mandate            |
      |                         |   redacted session view  |
      |                         |------------------------->|
      |                         |        accept or counter |
      |                         |<-------------------------|
```

This part is done and I am not proposing to change any of it: the mandate as the whole
authority model, `redactSessionFor` as the single place a counterparty view is built,
Ed25519 agreements, the engine knowing nothing about televisions, MCP as a client of the
REST API.

---

## 3. What is missing

| # | Gap | Evidence in our own code or numbers |
| --- | --- | --- |
| 1 | One offer per round, so a package that is cheap for me and good for you is only found by luck. | Efficiency 0.80, Pareto-optimal 17%. |
| 2 | Neither agent ever learns the other's priorities. | `agents/rule-strategy.ts:90` weights all dimensions equally. |
| 3 | Owners are asked for a number between 0 and 1. | `MandateBuilder.tsx:60`, a slider labelled "Walk away below 0.30". |
| 4 | The product does not know whether its own deals are any good. | `Pareto` appears only under `scripts/hw7/`. It is in the grader, not in JANG. |

Gap 2 is the one I would point at hardest. Our agent's opening line, at
`agents/rule-strategy.ts:192`, is:

> "Tell me which of these terms matters most to you and I will trade against it."

**Nothing in the codebase reads the answer.** We ask the question and have no ears. Joint
value comes from trading an issue that is cheap for me against one that is expensive for
me and cheap for you. Our agent cannot see that trade, so four terms bought us reach
(Claim A) without buying us quality (Claim B).

---

## 4. The four changes

Each one is a named technique, not an invention. Each is **opt-in and off by default**,
the way `respectBounds` shipped.

### Stage 1: three offers instead of one

**MESO** (multiple equivalent simultaneous offers) is everyday practice: put forward
several packages worth the same to you and let the other side pick. Their pick reveals
their priorities, and it costs you nothing, because you were indifferent.

`bestCounter` already enumerates the whole candidate space. Today it picks one. I want it
to pick **three that are as different from each other as possible** among the packages
clearing its target.

Run against our TV scenario. Three packages, all worth **0.56 to the seller**:

| Package | Seller | Buyer |
| --- | --- | --- |
| $1,220 · 1 day · 36 months · no soundbar | 0.554 | **0.508** |
| $1,130 · 28 days · 18 months · no soundbar | 0.559 | 0.347 |
| $1,250 · 26 days · 12 months · soundbar | 0.565 | 0.236 |

The seller cannot tell them apart. The buyer values them two to one.

The demo deal today is buyer 0.486 / seller 0.560. The first row is buyer 0.508 / seller
**0.554**, so the buyer gains 0.022 and the seller gives up 0.006. That is a textbook
trade and our current structure cannot find it.

**The offers are generated by the agent and chosen by the counterparty agent. No human is
in this loop.** The owner wrote a mandate and is done.

| File | Change |
| --- | --- |
| `src/lib/jang/types.ts` | `Offer` gains `alternatives?: Terms[]`, max 2 |
| `src/lib/jang/session.ts` | `submitOffer` checks **each** alternative. `acceptStandingOffer` takes which one |
| `src/app/api/sessions/[id]/offers/route.ts` | Pass alternatives through |
| `src/app/api/sessions/[id]/accept/route.ts` | Accept a specific package |
| `mcp/server.ts` | `offer` and `counter` take alternatives, `accept` takes a choice |
| `db/schema.sql` | `offers` gains `alternatives jsonb` |
| `src/lib/store/*` | Both implementations, held by the shared conformance suite |
| `agents/rule-strategy.ts` | `bestCounter` returns three diverse packages |
| `src/components/LiveNegotiation.tsx` | Three rungs instead of one |

> **Your call.** Accepting must now name a package. Today `acceptStandingOffer(session,
> agentId)` accepts "the standing offer", which is ambiguous once three are on the table,
> and an ambiguous accept means an ambiguous signed agreement. I would pass an explicit
> offer reference rather than an index.

### Stage 2: priorities, not positions

*Getting to Yes* in one line: argue about interests, not positions. **A mandate already
holds both.** Hard bounds are positions, weights are interests, and only positions ever
reach the other side.

I want an owner to be able to publish **the order alone**:

```
["warrantyMonths", "price", "deliveryDays", "bundle"]
```

No weights. No bounds. No reservation value. Opt-in, default off.

The counterparty agent feeds that order into `distanceToTheirAsk` as weights, and for the
first time moves toward **what the other side cares about** rather than toward where they
happen to be standing.

| File | Change |
| --- | --- |
| `src/lib/jang/types.ts` | `MandateBody` gains `disclosePriorities?: boolean` |
| `src/lib/jang/session.ts` | `redactSessionFor` emits the order when opted in, and nothing else |
| tests | A new leak test beside the existing one: disclosure must not leak a single number |
| `agents/rule-strategy.ts` | Weight `distanceToTheirAsk` by the disclosed order |
| `src/components/MandateBuilder.tsx` | A checkbox |

> **Your call.** This changes what an owner signs. The field has to be optional with a
> default so existing mandates still verify.

### Stage 3: ask for the alternative, not a number

Nobody can answer "what is your reservation utility". In negotiation you never ask it. You
ask what happens if the deal falls through, and the threshold follows.

```
Ask       "If you do not buy it here, what will you do instead?"
Answer    "Another shop has it at $1,280, 12 month warranty, a week's delivery."
Derive    reservationUtility = utility(that package, this mandate)
```

Measured on the TV scenario:

| What the owner says | Derived threshold |
| --- | --- |
| "$1,280, 12 months, 7 days" | 0.113 |
| "$1,250, 24 months, 14 days" | 0.278 |

**The owner never sees a number.** The same screen replaces the importance sliders with
three to five forced choices between complete packages, which pins down the weights the
way conjoint analysis does. TV goes from nine sliders to about five questions.

This needs one new file, `src/lib/jang/elicit.ts`, which only calls the existing
`utility()`. The engine is untouched. And because the engine is category blind, the
question generator is too: it needs an `ItemSpec` and nothing else, so it works for the
Cambridge lease unchanged.

### Stage 4: the frontier as a product feature

`Pareto` lives only in `scripts/hw7/`. **JANG does not know whether its own deals are any
good.** I want to promote that code into `src/lib/jang/frontier.ts`.

The property that makes this cheap: **the frontier is a function of the two mandates, not
of the offers.** Mandates are fixed when a session opens, so it is computed **once per
session** and read thereafter.

Measured end to end, including enumeration, scoring, filtering and extraction:

| Scenario | Dimensions | Packages | Frontier | Time |
| --- | --- | --- | --- | --- |
| `tv-clearance` | 4 | 7,800 | 148 | **6 ms** |
| `cambridge-rental` | 5 | 2,660 | 62 | **2 ms** |

Extrapolating on the TV lattice, worst case: **5 dimensions about 77 ms, 6 about 850 ms, 7
about 9 seconds.** So I want to **cap negotiable dimensions at 5**, one line in
`ItemSpecSchema`. `cambridge-rental` already has exactly 5, so nothing we have breaks and
we already own the stress case.

(Use the sorted sweep, not pairwise comparison. Two objectives means one sort, O(n log n).)

Four places it earns its keep:

| When | What it does |
| --- | --- |
| **Session opens** | Feasible set empty? Then no agreement is possible at all. Say so at round 0 instead of burning 12 rounds. HW7's no-ZOPA case was 20 markets per seed doing exactly that, and with Claude agents those rounds cost money. We spent $84.08 on 60 negotiations. |
| **During** | `/admin` draws the frontier and where the table currently sits. That screen already shows both mandates, so nothing new leaks. Also detects deadlock. |
| **Before signing** | If a package exists that **both** sides prefer to the one about to be signed, offer it. Either side vetoes and the original stands, so nobody can lose. |
| **After** | Record efficiency and frontier distance on the agreement, so we can eventually quote real numbers instead of benchmark numbers. |

> **One thing we must not do.** JANG must not filter or reorder an agent's offers using
> the frontier. Which candidates survived would let an agent reverse-engineer the
> counterparty's preferences, defeating redaction, and it would make JANG a negotiator for
> one side instead of a neutral. The frontier may only drive proposals **both sides can
> refuse**.

---

## 5. What I am not touching

| Untouched | Why |
| --- | --- |
| `src/lib/jang/utility.ts` | Change the scoring and nothing compares to HW7 |
| `src/lib/jang/mandate.ts` | The authority check is the safety property |
| Ed25519 signing, agreement body | `npm run verify` must keep passing unchanged |
| Default redaction behaviour | What does not leak today must not leak tomorrow |
| The engine's category blindness | It is why the Cambridge lease needed no code |
| Category templates | Out of scope, see section 8 |

**Every behavioural change is opt-in and off by default.** `npm run demo`, `npm run verify`
and `npm run misuse` behave exactly as they do today unless a flag is set.

---

## 6. What it buys us, and what could go wrong

### Measured

The HW7 harness already runs variants across three seeds and four market shapes in 77
seconds. Adding arms is nearly free:

| Arm | Question |
| --- | --- |
| Baseline | HW7 reference |
| + MESO | Does efficiency move off 0.80? |
| + MESO + mutual disclosure | Does it move further? |
| + one-sided disclosure | **Does the side that discloses get exploited?** |

**Claim A has to be watched in every arm.** Buying efficiency with closing rate is not a
win.

### For the coursework

Stages 1 and 2 produce the **report**: a real experiment that can fail. Stages 3 and 4
produce the **demo**: an owner answering questions in plain language, and JANG visibly
catching a deal that left value on the table.

### Risks, honestly

| Risk | Severity | What we do |
| --- | --- | --- |
| **12 rounds may be too few** for disclosure or MESO to pay off. The literature usually assumes hundreds. | **High.** This could sink stage 1. | Run round budget as a sensitivity variable. "The effect grows with rounds" is still a result. |
| **Claim A could fall** while Claim B improves. | Medium | Report both in every arm. Never ship a flag that trades reach for quality. |
| **Disclosure leaks more than the order.** | Low odds, high cost. This is our core promise. | Write the leak test before the feature. |
| **Accept becomes ambiguous** with three offers up. | Medium, and it touches signed agreements. | Explicit offer reference. Section 9. |

Stage 1 is the one that might not work. That is why it goes first.

---

## 7. What JANG looks like afterwards

```
session opens
   |
   +-- both mandates lodged
   +-- frontier computed once (77 ms worst case), cached server side only
   +-- feasible set empty? tell both sides now, not after 12 rounds
   v
   agent A                        JANG                        agent B
      |  offer(terms, alternatives[2]) |                           |
      |------------------------------->|                           |
      |         check all three against A's mandate                |
      |                                |  view + B's priority order|
      |                                |-------------------------->|
      |                                |   accept(which) or counter|
      |                                |<--------------------------|
      |         on accept: does a package exist that BOTH           |
      |         prefer? offer it. either side refuses and the       |
      |         original agreement stands.                          |
      v
   Ed25519 agreement, unchanged, plus efficiency and frontier distance recorded
```

The owner's side:

```
before   9 sliders, ending in "Walk away below 0.30"

after    "If this falls through, what will you do instead?"
         3 to 5 choices between complete packages
         one checkbox: publish my priority order
```

---

## 8. Who does what, in what order

Following `docs/work-split.md`: the core is yours, the experiment is mine.

| Order | Stage | Size | Your sign-off | Who builds |
| --- | --- | --- | --- | --- |
| 1st | MESO | Large: schema, protocol, DB, agent, UI | **Yes** | You on protocol and schema, me on agent and arms |
| 2nd | Priority disclosure | Medium | **Yes**, it changes what is signed | You on redaction, me on agent |
| 3rd | Pareto | Small, promoting existing code | No | Me |
| 4th | BATNA elicitation | Medium, mostly UI | No | Me |

Stage 1 first because the risk is there and we should find out early. BATNA last because
it cannot fail and is pure demo value.

**Explicitly out of scope:** the category template layer, meaning who decides which terms
are negotiable for a given item and what the sensible defaults are per category. It is the
right answer to that question, but it is productisation, not research. Future work in the
report.

**Open question I cannot answer alone:** I do not have the final project's deadline or
written requirements in front of me. This order assumes time for all four. If we are
short, **stages 1 and 3 carry the result.**

---

## 9. What I need you to decide

1. **`Offer.alternatives`, max 2.** Happy to extend the offer schema, or should this live
   somewhere else?
2. **Accept must name a package.** I propose an explicit offer reference rather than an
   index, so the agreement body stays unambiguous. Your signing path, your call.
3. **`MandateBody.disclosePriorities`.** This changes what owners sign. Optional with a
   default keeps old mandates verifying. Does that satisfy you?
4. **Cap negotiable dimensions at 5** in `ItemSpecSchema`. `cambridge-rental` is already at
   5. Any objection?
5. **One migration or two?** `offers.alternatives` in stage 1 and the agreement's
   efficiency columns in stage 4 could land together or separately.
6. **Where does the cached frontier live?** It is derived from both mandates, so it must
   never pass through `redactSessionFor`. The session object is convenient but you may
   prefer it elsewhere.

---

## 10. Summary

**JANG's differentiator is negotiation, not matching.** We built a safe board to negotiate
on. We have not yet built the negotiating.

HW7 proved JANG closes deals a price-only market cannot reach (**81% against 53%**) and
failed to prove those deals are better for both sides together (**efficiency 0.80 against
0.84**). The cause looks like our agent, not our idea: it moves toward the counterparty's
position without ever learning their priorities, and our own opening line asks a question
that nothing reads.

Four changes, all standard technique, all opt-in and off by default:

| | Change | Effect |
| --- | --- | --- |
| **1** | Three equivalent offers instead of one | The counterparty's choice reveals priorities at no cost. Three packages identical to the seller are worth 0.508, 0.347 and 0.236 to the buyer |
| **2** | Publish the priority order, never the numbers | Lets an agent trade against what the other side actually values |
| **3** | Ask for the walk-away alternative | Threshold derived. Owners stop seeing "0.30" |
| **4** | Pareto frontier into the product | 77 ms once per session at a 5 dimension cap. Catches impossible negotiations at round 0 and value left on the table before signing |

Nothing touches the utility function, the mandate check, signing, or default redaction.
Everything is measured on the existing harness, which runs in 77 seconds, watching Claim A
and Claim B together.

**Section 9 has six questions. Stages 1 and 2 are in your core and I will not start them
until you have answered.**
