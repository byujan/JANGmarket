# HW7 benchmark protocol

Committed before the fresh seeds were run, so the checks below were fixed in advance.

## Claims

- **A. Closing rate.** In markets where a mutually acceptable package exists, JANG's
  multi-issue negotiation closes more deals than the same agents negotiating price only.
- **C. Joint value.** Deals JANG closes are worth more to both sides together (higher share
  of the best available joint surplus, closer to the Pareto frontier) than price-only deals.

## Conditions (same markets, same agents, same round budget)

| Condition | What differs |
| --- | --- |
| JANG | all four terms negotiable (price, delivery, warranty, soundbar) |
| Price only (main baseline) | non-price terms pinned to the posted defaults in **both** mandates, so the engine enforces it |
| Posted price | the seller's posted package, take it or leave it |
| Oracle price | the midpoint of the two private price limits, other terms at posted defaults |

## Result checks (independent of the negotiators)

- **Feasible**: exhaustive search over the item's step lattice finds at least one package inside
  both mandates (hard bounds and reservation utility).
- **Closed**: a JANG-signed agreement exists and `auditAgreement` passes (signature + both mandates).
- **Pareto-optimal**: no feasible lattice package is at least as good for both and better for one.
- **Efficiency**: (uB - rB + uS - rS) / the maximum of the same over feasible packages.
- Must hold in every run: 0 agreements in infeasible markets, 0 constraint violations.

## Cases (generation rules in `scripts/hw7/lib.ts`, `makeMarket`)

| Case | Rule | Markets per seed |
| --- | --- | --- |
| ordinary | the original HW6 benchmark generator | 40 |
| narrow | buyer ceiling $0-50 above seller floor | 40 |
| asymmetric | ordinary markets, seller toughness 4.0 instead of 1.6 | 40 |
| nozopa | buyer ceiling $10-200 below seller floor | 20 |

## Seeds

- Tuning: `20261028` (inspected while diagnosing and choosing the change)
- Fresh: `20261101`, `20261102` (not run before this file was committed)

## Change

Diagnosis on the tuning seed: of 16 feasible ordinary markets JANG missed, 12 ended with an
agent repeatedly trying to **accept a package outside its own hard limits** (the rule strategy
scores a package by utility only), which JANG refused; only 4 ran out of rounds. For price-only
the figure was 24 of 24.

- **Formal change ("fix")**: the rule agent accepts only packages inside its own mandate
  (`respectBounds`), and otherwise counters.
- **Sensitivity, not the formal change**: Option 1 deadline-aware concession (`deadlineAware`),
  Option 2 double round budget.
- The runner now stops an agent refused three times in a row for the same reason; before, the
  same markets ended at a 200-turn cap with the same outcome.

## Command

```
node --experimental-transform-types scripts/hw7/run.ts --seed=<seed> --variant=<base|fix|option1|option2|fix+option1>
node --experimental-transform-types scripts/hw7/summarize.ts
```
(`npx tsx` works the same on a machine where tsx is installed.)
