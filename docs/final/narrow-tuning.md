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

## Results

*(filled in after the runs)*
