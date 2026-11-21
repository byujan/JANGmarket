# Narrow markets: why deals were missed, and one change

*Hendrick, 2026-11-21. This section was written and committed before any
fresh-seed run of the change.*

## The problem

On narrow markets (buyer ceiling $0–50 above the seller floor) the best arm in
`results/final`, `fix+meso+disclose`, closes 14 of 22 feasible markets on the
fresh seeds. On the tuning seed 20261028 it closes 6 of 12, and **all six
failures stop at the round limit**.

## Diagnosis (tuning seed only)

Traced round by round, the failures share one cause: **the counter-offer search
cannot make a small move.** `candidates()` in `agents/rule-strategy.ts` splits an
agent's own range for each term into `grid` (9) points. A seller whose price
range runs from its floor to 3,000 considers prices about 225 apart, so near the
end it can stand only at its floor-side grid point or far above it. The
counterparty's ask is a candidate only when it is already inside the agent's own
bounds, which in a narrow market it usually is not.

Two failures, buyer opening first:

- index 13: at round 11 the seller's target is 0.366 and the buyer's last ask
  is worth 0.363 to it, just short. The nearest package the seller could build
  was worth **0.516** to it (price 1,340 against an ask of 1,150), so it asked
  for far more than it needed and the buyer could not reach it in the one move
  left.
- index 5: the seller's last offer was inside its own target but not the
  buyer's; a package at the same price with shorter delivery cleared both, and
  the seller never considered it.

## The change: `refine`

`RuleOptions.refine`: alongside the grid, consider the counterparty's ask pulled
inside our own bounds, and points 1/32, 1/16, 1/8 and 1/4 of the way from there
back toward our own ideal. A small concession becomes a small move. Off by
default; the harness variant is `refine`.

## Rule fixed before the fresh run

1. Tuning seed 20261028 only: compare `fix+meso+disclose` against
   `fix+meso+disclose+refine`. No other variant is tried for selection.
2. Run the fresh seeds 20261101 and 20261102 **once**, for both arms.
3. Adopt `refine` as the product default only if, on the fresh seeds, narrow
   closes more **and** ordinary realised efficiency (failure = 0) does not fall,
   both judged with `scripts/final/significance.ts` against `fix+meso+disclose`.
   Otherwise it stays off and this is reported as a negative result.

## Results — negative, not adopted

Paired on identical markets against `fix+meso+disclose`. Closing is an exact
McNemar test; realised efficiency counts a failed negotiation as 0, with a
bootstrap 95% CI (10,000 resamples).

| | narrow close | arm-only / base-only, p | realised eff. diff, 95% CI | ordinary close | ordinary realised eff. diff |
|---|---|---|---|---|---|
| Tuning 20261028 | 3/12 vs **6/12** | 0 / 3, p=0.250 | −0.217 [−0.460, +0.003] | 30/33 vs 29/33 | +0.018 [−0.029, +0.071] |
| **Fresh 20261101+02** | 11/22 vs **14/22** | 0 / 3, p=0.250 | −0.121 [−0.271, +0.006] | 55/58 vs 55/58 | +0.001 [−0.027, +0.032] |

`refine` closed **no** market the baseline missed and lost three it had closed,
on both the tuning and the fresh seeds. Ordinary and asymmetric markets are
unchanged within noise. It fails criterion 3 and **stays off**. The option is
kept in the code, off by default, so the result can be reproduced:
`npx tsx scripts/hw7/run.ts --seed=20261101 --variant=fix+meso+disclose+refine --out=results/final`.
The baseline arm re-ran byte-for-byte identical to the committed file before
the comparison.

**What this says about the diagnosis.** Coarse spacing was real but was not the
binding cause: given finer moves, the agents spend the same twelve rounds
making smaller concessions and still meet at the round limit. Every failure, in
both arms, stops at `ROUND_LIMIT` with the buyer unable to answer the seller's
last offer. That points at the round budget and who moves last, not the search.
HW7 already showed doubling the rounds (`option2`) lifted narrow from 4/22 to
9/22 under `fix`; `fix+meso+disclose+option2` has not been run. That would be
the next experiment, registered the same way before it is run.

---

## Second attempt: a longer round budget

*Written and committed before any run of this arm, 2026-11-21.*

**Hypothesis.** Every narrow failure, in both arms above, stops at
`ROUND_LIMIT`: the schedule brings each side to its floor only at the last
offer, and the side that moves last has no reply left. More rounds give the
same schedule room to finish. HW7 already showed `option2` (24 rounds instead
of 12, same concession curve) lifted narrow from 4/22 to 9/22 under `fix`, but
it has never been run with MESO and disclosure, which are the best arm now.

**Arm.** `fix+meso+disclose+option2` against `fix+meso+disclose`. Nothing else
is tried.

**Rule.**
1. Tuning seed 20261028 first, as a sanity check only. It does not select
   anything, since there is one arm.
2. Fresh seeds 20261101 and 20261102, **once**.
3. "Helps narrow" requires narrow to close more on the fresh seeds, with no
   market the baseline closed lost, and ordinary realised efficiency
   (failure = 0) not lower: paired difference with a 95% CI whose lower end is
   above −0.02.
4. Even if it helps, this changes how long a negotiation takes (up to 24
   offers), which matters for the demo and for any agent waiting on the house.
   So the result is a **recommendation to Peter**, not a change to the
   product default made here.

### Result — negative

Paired on identical markets against `fix+meso+disclose`, same method as above.

| | narrow close | arm-only / base-only, p | ordinary close | ordinary realised eff. diff, 95% CI | mean rounds |
|---|---|---|---|---|---|
| Tuning 20261028 | 4/12 vs **6/12** | 0 / 2, p=0.500 | 30/33 vs 29/33 | +0.048 [−0.050, +0.135] | 22–24 |
| **Fresh 20261101+02** | 11/22 vs **14/22** | 3 / 6, p=0.508 | 51/58 vs **55/58** | −0.039 [−0.113, +0.026] | 22–24 |

Fails criterion 3 on both counts: narrow closes fewer, and the CI's lower end
is below −0.02 on ordinary, where four deals the baseline closed were lost. Not
recommended. Raw files: `results/final/fix+meso+disclose+option2-seed*.json`.

**Why the hypothesis was wrong.** The rule strategy schedules concession on
the *fraction* of the budget used (`elapsed = roundsUsed / (maxRounds − 1)` in
`agents/rule-strategy.ts`). Doubling the budget stretches the same curve over
twice as many offers: each side still reaches its floor only at its last
offer, so the last-mover problem is untouched. Every failure in both arms is
still the buyer at `ROUND_LIMIT` (narrow 11 vs 8, ordinary 7 vs 3). Under plain
`fix`, `option2` did help (narrow 4 → 9 of 22), because without disclosure the
extra offers were spent learning what the other side wanted; with disclosure
that is already known, and the extra length only adds endgame noise. Narrow
outcomes flip in both directions (3 and 6), which is what a knife-edge endgame
looks like.

**What this leaves.** Two negative results point the same way: the narrow
failures are an *endgame* problem, not a search or time problem. The seller's
last offer clears its own floor but not the buyer's, and the buyer has no
reply left. Plausible next steps, none run here:

- an endgame rule: on the last offer an agent will make, choose among packages
  at its own floor the one most likely to clear the other side's (using the
  disclosed order), rather than the one closest to their last ask;
- JANG itself, which holds both mandates, telling both sides at the round limit
  only that a package acceptable to both exists. This uses the frontier code
  already in `src/lib/jang/frontier.ts`, but leaks one bit about each side's
  limits, so it is a design decision, not a tuning change.

---

## Third attempt: choose the last offer for the other side

*Written and committed before any benchmark run of this arm, 2026-11-21.*

**Hypothesis.** Both negative results above say the narrow failures are an
endgame problem: the last offer clears its maker's floor but not the other
side's, and the other side has no reply left. The last offer is chosen as the
package *nearest* the other side's last ask, and nearness is symmetric: a
package better for them than what they asked (a shorter delivery than they
requested) is marked down for the gap. On tuning-seed index 5 the seller's last
offer was {1210, 16 days, 24 months}; the same price with 11 days cleared both
floors, and the seller never chose it because 11 is "further" from 16.

**Change: `endgame`.** Only on an agent's last offer of the session
(`roundsUsed ≥ maxRounds − 2`). Start from the nearest package as before; then
consider only packages that are, on **every** term, no worse for the other side
than that one (direction per term read from the gap between the two last asks,
or the item's declared buyer preference); among those that still clear our own
target, take the one that gives them most, weighted by their disclosed
priorities when there are any. Our own floor and hard bounds are untouched, and
a last offer the other side would have accepted is never made worse for them.
Unit tests: `agents/rule-strategy.test.ts`, "endgame".

**Arm.** `fix+meso+disclose+endgame` against `fix+meso+disclose`. Nothing else
is tried.

**Rule.**
1. Tuning seed 20261028 first, as a sanity check. One arm, so nothing is
   selected there.
2. Fresh seeds 20261101 and 20261102, **once**.
3. It passes if, on the fresh seeds, narrow closes more than the baseline
   **and** ordinary realised efficiency (failure = 0) has a paired 95% CI whose
   lower end is above −0.02.
4. If it passes, turn it on for the product's rule agent (`endgame: true` in
   `src/lib/server/negotiate.ts`, the console's fallback when no model is
   available) and in `scripts/market.ts`. It changes only the last offer, so
   negotiation length and the demo are unaffected. If it fails, it stays off and
   is recorded here like the two above.

### Result — fails the rule, not adopted, but the first one to help narrow

Paired against `fix+meso+disclose`, same method as above.

| | narrow close | ordinary close | ordinary realised eff. diff, 95% CI | asymmetric close | asymmetric realised eff. diff |
|---|---|---|---|---|---|
| Tuning 20261028 | **8/12** vs 6/12 | 28/33 vs 29/33 | −0.057 [−0.122, −0.003] | **29/33** vs 25/33 | +0.097 [−0.004, +0.214] |
| **Fresh 20261101+02** | **15/22** vs 14/22 (4 / 3) | 51/58 vs **55/58** (2 / 6) | −0.043 [**−0.122**, +0.032] | **53/58** vs 47/58 (7 / 1, p=0.070) | +0.096 [+0.009, +0.192] |

Narrow closes one more, so criterion 3's first half holds. The ordinary CI's
lower end (−0.122) is below −0.02, so the second half fails. **Not adopted;**
`negotiate.ts` and `market.ts` are unchanged. Raw files:
`results/final/fix+meso+disclose+endgame-seed*.json`.

**Why it lost ordinary deals (diagnosis, tuning and fresh traces).** The rule
was meant never to make a last offer worse for the other side, and it is not
the choice step that fails. The *direction* estimate fails. Directions are
read from the gap between the two last asks. When the other side has already
crossed over on a term, the gap points the wrong way. Fresh seed 20261101,
ordinary #3, buyer opening: at round 10 the buyer's own endgame offer lengthens
delivery from 6 to 11 days, a concession to the seller. At round 11 the seller
reads "they asked 11, I offered 6" as *the buyer wants longer delivery*, and
"gives" it 45 days. That is outside the buyer's limit, and the session ends at
`ROUND_LIMIT`. Without `endgame` the same market closes at round 12.

**What this suggests, not run.** Infer direction from the agent's own
preferences instead: in these markets each term is opposed (what the seller
wants more of, the buyer wants less of), so "the opposite of my own ideal" is a
stable prior that a concession cannot flip. The item's declared `buyerPrefers`
would still override it. The fresh seeds 20261101–02 have now been used for
three arms, so a fourth attempt should be confirmed on a seed none of them has
seen.

---

## Fourth attempt: endgame with directions that a concession cannot flip

*Written and committed before any benchmark run of this arm, 2026-11-21.*

**Change: `endgame2`** (`endgame: true, endgameDirections: "opposed"`). It is
identical to the third attempt except where directions come from: the opposite
of the agent's own preference on each term (`sign(worst − ideal)` of its own
mandate), and the item's declared `buyerPrefers` wherever there is one. The
crossed-over case that broke the third attempt is now a unit test: "is not
fooled when the buyer has already conceded past the seller on a term". The
third attempt's arm re-ran identically after this change.

**Seeds.** 20261101 and 20261102 have served three arms, and this change was
designed from a trace on one of them. So the decision is made on **two new
seeds, 20261121 and 20261122**, never run before by any arm. The baseline
`fix+meso+disclose` is run on them too, for the pairing.

**Rule.**
1. Tuning seed 20261028, a sanity check only.
2. New seeds 20261121 and 20261122, once, both arms. For comparison only,
   also the already-used fresh seeds, labelled as such.
3. Passes if, **on the new seeds**, narrow closes more than the baseline
   **and** ordinary realised efficiency (failure = 0) has a paired 95% CI whose
   lower end is above −0.02.
4. If it passes, turn it on for the product's rule agent
   (`src/lib/server/negotiate.ts`) and `scripts/market.ts`. It changes only the
   last offer, so negotiation length is unaffected. If it fails, it stays off
   and is recorded below.

### Result — passes; adopted

Paired against `fix+meso+disclose`, same method as above. **Decision seeds are
20261121 and 20261122,** run for the first time here.

| Seeds | narrow close | arm-only / base-only, p | ordinary close | ordinary realised eff. diff, 95% CI | asymmetric close |
|---|---|---|---|---|---|
| Tuning 20261028 (sanity) | **9/12** vs 6/12 | 3 / 0 | **31/33** vs 29/33 | +0.024 [−0.028, +0.095] | **32/33** vs 25/33 |
| **New 20261121+22 (decision)** | **20/20** vs 8/20 | **12 / 0, p=0.0005** | 61/62 vs 61/62 | −0.002 [**−0.015**, +0.011] | **61/62** vs 57/62 |
| Used 20261101+02 (comparison only) | **20/22** vs 14/22 | 6 / 0, p=0.031 | **57/58** vs 55/58 | +0.034 [−0.004, +0.085] | **57/58** vs 47/58 |

Both halves of criterion 3 hold on the new seeds. Narrow closes 12 more
markets and loses none. The ordinary CI's lower end (−0.015) is above −0.02.
Across every seed and case, `endgame2` **never failed a market the baseline
closed**. Over the 214 deals it closed on the tuning and new seeds:
**0 constraint violations and 0 false agreements.** Narrow realised efficiency
rose by +0.50 [+0.31, +0.70] on the new seeds.

**One cost to state.** The last offer gives the receiving side more. On narrow
markets the buyer's share of the surplus rose (+0.08 on the new seeds, +0.22 on
the used ones), because the seller often makes the last offer. On ordinary
markets the share is unchanged (−0.003). The rule trades a little of the last
mover's share for the deal happening at all.

**Adopted, per the registered rule.** `endgame: true, endgameDirections:
"opposed"` is now on for the console's rule agent (`src/lib/server/negotiate.ts`)
and both sides in `scripts/market.ts`. The strategy's own default is unchanged,
so every earlier benchmark arm still reproduces. Not changed: the model-driven
agents' prompts. Checked after adoption: `npm test` (204), `npm run demo`,
`npm run verify` (7/7, zero violations), `npm run misuse` (5/5 refused),
`npm run build`, and `npm run market -- --buyers=6 --supply=1` (one sale).

## Check: does the endgame rule hold without priority disclosure?

*Written and committed before any run of these arms, 2026-11-21.*

**Why.** The fourth attempt was judged against `fix+meso+disclose`, where both
owners share their priority order. We have decided disclosure stays opt-in and
off by default (it reveals part of a mandate), so the product's usual case is
no disclosure. The adopted rule does not read disclosed priorities: its
directions come from the agent's own mandate and the item's `buyerPrefers`. But
its effect was only measured with disclosure on, so the claim "narrow 8/20 →
20/20" is not yet shown for the default.

**Arms.** `fix+meso+endgame2` against `fix+meso`. No code changes.

**Seeds.** Decision on **20261123 and 20261124**, never run by any arm. For
comparison only, also 20261121+22 (used once, by the fourth attempt's decision)
and the tuning seed 20261028.

**Rule.**
1. Holds if, on the decision seeds, narrow closes more than `fix+meso` **and**
   ordinary realised efficiency (failure = 0) has a paired 95% CI whose lower
   end is above −0.02. Same test as the fourth attempt.
2. If it holds, the slide claim is restated on these numbers, for owners who do
   not disclose.
3. If narrow does not improve but ordinary passes, the rule stays on (it did
   no harm), and the claim is limited to owners who disclose.
4. If ordinary fails, the rule is turned off for the product, and recorded here.

### Result — holds without disclosure

`fix+meso+endgame2` paired against `fix+meso`, same method. **Decision seeds
20261123 and 20261124,** run for the first time here.

| Seeds | narrow close | arm-only / base-only, p | ordinary close | ordinary realised eff. diff, 95% CI | asymmetric close |
|---|---|---|---|---|---|
| **New 20261123+24 (decision)** | **19/27** vs 8/27 | **12 / 1, p=0.003** | 55/63 vs 50/63 | **+0.052 [+0.002, +0.115]** | 58/63 vs 51/63 |
| Used 20261121+22 (comparison) | 16/20 vs 10/20 | 6 / 0, p=0.031 | 59/62 vs 57/62 | +0.016 [−0.016, +0.057] | 61/62 vs 55/62 |
| Tuning 20261028 (comparison) | 7/12 vs 4/12 | 3 / 0 | 30/33 vs 26/33 | +0.076 [−0.006, +0.182] | 31/33 vs 22/33 |

Both halves of rule 1 hold on the decision seeds: narrow closes 11 more markets
net, and the ordinary CI's lower end (+0.002) is above −0.02. So, per rule 2,
the claim for owners who do not disclose is **narrow 8/27 → 19/27** on seeds
fixed beforehand. **0 constraint violations** in every arm run here.

Two things to state plainly:
- **It is no longer "never lost one".** On the decision seeds the baseline
  closed one narrow market that `endgame2` did not (12 gained, 1 lost).
- **Disclosure still adds on top.** For reference only (not part of the rule),
  `fix+meso+disclose+endgame2` on the same decision seeds, against the same
  `fix+meso`: narrow 24/27, ordinary 61/63, ordinary realised efficiency
  +0.168 [+0.092, +0.253]. So the rule does most of the narrow-market work on
  its own, and owners who choose to disclose close more again.

The buyer's share on narrow markets rose by +0.065, as in the fourth attempt:
the last offer gives the receiving side more. No change to the product: the
rule was already on, and stays on.

### Result — holds without disclosure

`fix+meso+endgame2` paired against `fix+meso`, same method. **Decision seeds
20261123 and 20261124,** run for the first time here.

| Seeds | narrow close | arm-only / base-only, p | ordinary close | ordinary realised eff. diff, 95% CI | asymmetric close |
|---|---|---|---|---|---|
| **New 20261123+24 (decision)** | **19/27** vs 8/27 | **12 / 1, p=0.003** | **55/63** vs 50/63 | +0.052 [**+0.002**, +0.115] | **58/63** vs 51/63 |
| Used 20261121+22 (comparison) | **16/20** vs 10/20 | 6 / 0, p=0.031 | **59/62** vs 57/62 | +0.016 [−0.016, +0.057] | **61/62** vs 55/62 |
| Tuning 20261028 (sanity) | **7/12** vs 4/12 | 3 / 0 | **30/33** vs 26/33 | +0.076 [−0.006, +0.182] | **31/33** vs 22/33 |

Both halves of rule 1 hold: narrow closes 12 more markets on the decision seeds,
and the ordinary CI's lower end (+0.002) is above −0.02, so ordinary improves
too. Per rule 2, the claim for owners who do not disclose is **narrow 8/27 →
19/27** on these seeds. One narrow market the baseline closed was lost, so
"never lost a market the baseline closed" holds only with disclosure.

For reference, not part of the rule: with disclosure on top
(`fix+meso+disclose+endgame2` against the same `fix+meso`) the decision seeds
give narrow 24/27, ordinary 61/63. Disclosure still adds; the endgame rule does
most of the narrow gain without it.
