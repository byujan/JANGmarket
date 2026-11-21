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
