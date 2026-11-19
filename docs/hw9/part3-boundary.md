# HW9 Part 3: Boundary test, improvement, rerun

*Owner: Hendrick Jung. Branch `hendrick/hw9-boundary` on `byujan/JANGmarket`.*

## The boundary we tested
Every negotiable term in a JANG item has a range and a **step**. For the TV scenario:
- price: 500–3000, in steps of $10
- warranty: 12–48 months, in steps of 6
- soundbar `bundle`: 0 or 1

An agent that only has the documentation can easily send `bundle: 0.5` or a price with cents. A Claude agent splitting the difference does this naturally.

**Question:** does JANG refuse a package that is inside every range but off the grid?

**Pre-run success check:**
- The off-grid offer is refused with `INVALID_TERMS`.
- The refusal tells the agent what a valid value looks like.
- The session stays usable, and a corrected offer can still close and be signed.

## Before: JANG signed half a soundbar
`npm run probe:off-step` runs through the same MCP tools a cold-start client uses (`offer`, `accept`). The seller's agent offers `{price: 1225.5, deliveryDays: 10.5, warrantyMonths: 13, bundle: 0.5}`.

```
OK  seller offer {"price":1225.5,"deliveryDays":10.5,"warrantyMonths":13,"bundle":0.5}
OK  buyer accept {}
    Deal closed in 1 rounds. JANG signed agreement agr_…
Outcome: ACCEPTED off-step offer; JANG signed an agreement with terms
         {"price":1225.5,"deliveryDays":10.5,"warrantyMonths":13,"bundle":0.5}
```

We got this result on every run (6 of 6) (transcript: `results/hw9/before.txt` / `.json`).

The cause was in `validateTermsShape` (`src/lib/jang/session.ts`), which checked only that each value is finite and in range. `step` was declared in `types.ts` but enforced nowhere. Only the frontier search used it.

**Classification:** a project/interface limitation, not a test-setup problem.
- Mandate checks passed, because every value is inside both owners' limits.
- The signature is valid.
- Yet the signed agreement describes a package the seller cannot deliver.

## The improvement
1. **Enforce the grid.** A value must equal `min + k·step` for a whole number k, with a 1e-9 tolerance for float noise. This one check covers the main package and every MESO alternative.
2. **Make the refusal actionable.** One `INVALID_TERMS` refusal now names *every* off-grid term and its nearest valid values. An agent can fix the whole package in one retry instead of discovering one term per round.
3. **Document the grid where agents read it.** The `get_session` summary now prints `price 500..3000 in steps of 10 USD; … Offers off this grid are refused.` The `terms` schema description in the MCP `offer`/`counter` tools also states the rule.

## After: refused, corrected, signed
```
REFUSED seller offer {"price":1225.5,"deliveryDays":10.5,"warrantyMonths":13,"bundle":0.5}
        INVALID_TERMS: term "price" = 1225.5 is not on the item's grid: values run 500..3000
        in steps of 10 (nearest valid: 1220 or 1230); term "deliveryDays" = 10.5 … (10 or 11);
        term "warrantyMonths" = 13 … (12 or 18); term "bundle" = 0.5 … (0 or 1)
OK      seller offer {"price":1220,"deliveryDays":10,"warrantyMonths":18,"bundle":1}
OK      buyer accept {}   → Deal closed in 1 rounds. JANG signed agreement agr_…
Outcome: REFUSED off-step offer with INVALID_TERMS; corrected offer accepted and signed
```
(transcript: `results/hw9/after.txt` / `.json`)

## Regression test
We added 7 cases to `src/lib/jang/session.test.ts`:
- One for each off-grid term type: a fractional boolean, a price off the $10 grid, a warranty off the 6-month grid, fractional days. Each one also checks that the message names the nearest valid values.
- An off-grid MESO alternative.
- All off-grid terms named in one refusal.
- On-grid values still accepted, including range ends and a float-noise price (`0.1*3*5000 = 1500.0000000000002`).

Without the fix, 5 of these fail; the two that check behaviour that is unchanged pass either way. With the fix, all 26 session tests pass. One more test covers the rule agent's candidate grid.

The full pipeline, `npm run check`, passes:
- typecheck
- **177/177 tests in 18 files**
- `demo`
- `verify` (7/7 checks)
- `misuse` (5/5 probes blocked)

Log: `results/hw9/check.txt`.

## What improved, what did not, what remains unproven
- **Improved:** JANG can no longer sign a package that cannot exist. A client that sends one gets a refusal it can act on, and one retry recovers.
- **Knock-on fix:** the rule-based agent snapped its candidate values to a grid anchored at the owner's bound, not at the item minimum. A bound between grid points (a floor of $1,185, say) would have produced offers the new rule refuses. `candidates()` in `agents/rule-strategy.ts` now tightens off-grid bounds inward to the item grid. A test in `agents/rule-strategy.test.ts` covers it.
- **Did not change:** benchmark results. We reran HW7 seed 20261028 with the `fix` variant (140 negotiations) on `origin/main` and on this branch. The results are identical apart from timing fields, because the HW7 market generator only ever produces on-grid bounds.
- **Unproven:**
  - We have not yet measured how often Claude-driven agents produce off-grid offers in the HW7 runs. The new refusal could cost them a round.
  - The probe's corrected offer is scripted, not written by an LLM. The cold-start client's own recovery from this message has not been tested.
  - The Python port of the strategy in Nanda Town does not enforce the grid on its side, but JANG is the authority and now refuses off-grid packages.

## Reproduce
```bash
npm install
npm run dev               # terminal 1, http://localhost:3939
npm run probe:off-step    # terminal 2, prints the transcript and exits 0 only if refused + recovered
npx vitest run src/lib/jang/session.test.ts
npm run check
```
To see the "before" behaviour, check out `origin/main` and run the same probe. It exits 1 with `ACCEPTED off-step offer`.
