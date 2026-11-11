# The research JANG is built on, and where it shows up

Mapped against MIT 15.665, *Power and Negotiation* (Sharone, Spring 2014),
[lecture notes on OCW](https://ocw.mit.edu/courses/15-665-power-and-negotiation-spring-2014/pages/lecture-notes/).

The point of this document is to be honest about two things: how much of the course is
already load-bearing in the product, and which parts we have only gestured at.

---

## Already in the product

| Construct | Where it came from | Where it lives |
|---|---|---|
| Reservation price, the walk-away point | Class 2 | `reservationUtility` on every mandate; JANG refuses any offer or accept below it |
| ZOPA, the zone of possible agreement | Class 2 | `groundTruth().feasible` in `frontier.ts` |
| BATNA, and converting it into a reservation price | Class 2 | `elicit.ts` asks what the owner would do instead, rather than for a number. The lecture's line is "RP is a quantification of your BATNA" |
| Agreement bias, settling despite a negative ZOPA | Class 2 | Structurally impossible: an agreement outside either mandate cannot be signed |
| Expanding the pie across several terms | Class 3 | Multi-term packages, and `quality().efficiency` |
| Revealing rank order as a low-risk disclosure | Class 3 | `priorities.ts`. The lecture: "revealing priorities among issues (i.e. rank ordering) is a less risky disclosure" |
| MESOs, several equally good offers at once | Class 3 | `alternatives` on an offer, each checked against the proposer's own mandate |
| The Pareto frontier, and the cost of compromise | Class 4 | `frontier.ts`, and `paretoOptimal` on every closed deal |

The thing worth noticing is that **agreement bias is not a risk for JANG**. The lecture
warns that parties "reach agreement despite a negative ZOPA" because they get absorbed and
forget their own walk-away. An agent cannot: the check runs on the server, on every offer
and every accept, against a mandate the agent cannot edit.

## Added now, in the operator views

**The negotiator's dilemma** (Class 4), on `/admin`. Every closed deal is a point: value
created along the x-axis, the buyer's share of it along the y. The course's whole framing
is that a negotiator does both at once and often trades one for the other, so they belong
on the same axes. A point far right used the trades that were available; a point near the
dashed line split what it made evenly.

**Issue types** (Class 4), per session. Each term is classified:

- **compatible** — both sides want the same end of the range
- **distributive** — they want opposite ends and weigh it about equally
- **integrative** — opposite ends, but one side cares far more, which is what a trade is made of

The boundary between distributive and integrative is a judgement about degree, so it is
drawn at a stated threshold (`INTEGRATIVE_GAP`, a tenth of each side's attention) rather
than pretending the data decides it.

**Lose-lose detection** (Class 4). The lecture's compatible-issues table exists to show
that parties trade away things they both wanted, having assumed a conflict. When a
compatible term settles anywhere but the shared optimum, the session view says so.

**The compromise benchmark** (Class 4). The lecture's worked example reaches a joint 4,800
by splitting every issue and 13,200 by trading. The session view computes the same gap.
Often the more interesting answer: in the shipped television market, the midpoint package
is not allowed by either mandate, so the compromise everyone reaches for was never a deal.

**Anchoring** (Class 2), per session. Both opening positions and where the deal landed
between them, as a percentage of the distance. The lecture's anchoring question, asked of
a finished negotiation.

**Reversals** (Class 4). "Beware of sudden counterparty reversals at the end of
negotiations." A reversal is a package worth *less to the counterparty* than that same
side's previous one. The test has to be on the whole package rather than on single terms:
a multi-issue negotiation moves individual terms backwards constantly, and that is
logrolling working. Building this the naive way flagged our own agents trading a soundbar
for a longer warranty as bad faith.

**Pace and deadline pressure** (Class 2). Time between offers, and rounds used against the
budget. A negotiation that went to the wire reads differently from one that closed early.

**Session facts that were stored and never shown.** Whether either owner opted into
priority disclosure, how many turns carried MESOs, and whether the agreement still
verifies against the *current* signing key, which matters because a keyless instance mints
a new one on restart.

**Concession curves** (Class 3). "Declining magnitude of concessions is an unspoken signal
to suggest closeness to the RP." Each side's own valuation of its own successive offers,
drawn against both walk-away lines.

## Not done, in rough order of what it would be worth

1. **Anchoring across many sessions** (Class 2). The per-session reading exists now; what
   is missing is the aggregate, which would say whether opening first systematically pays
   on this platform the way it does for people.
2. **Reciprocity of concessions** (Class 3). The lecture advises labelling a concession and
   waiting. Our agents already label them in the note. Nobody has measured whether a
   labelled concession actually draws one back.
3. **Fairness and its effect on acceptance** (Class 10). We measure the split but never
   test whether a lopsided split gets refused on principle, which is the entire ultimatum
   literature.
4. **Multiparty and coalitions** (Class 9). The roadmap's one-to-many case. Hendrick's
   safety-margin simulation already shows a margin pays for itself with several
   counterparties, which is the nearest we have come.
5. **Relationships and repeated play** (Class 6). Reputation across sessions between the
   same owners. JANG stores enough to do it and does nothing with it.
6. **Cross-cultural norms** (Class 7) and **power and status** (Class 8). Interesting, and
   hard to make meaningful without a population of real owners.

## A caution about all of it

Every reading here is derived from both private mandates, so **none of it may ever reach an
agent or an owner**. It is on the operator surfaces only, and `service.test.ts` asserts the
negative: the agent-facing view and the signed agreement never match `/pareto|frontier|
feasib|efficien/`. The same reasoning as `feasibility()` applies — an agent told how good
a deal was could re-lodge a mandate and search for the counterparty's limit.
