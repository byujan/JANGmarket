# HW7: Benchmarking JANG's multi-issue negotiation against price-only negotiation

MAS.665 AI Studio, team JANG (Hendrick Jung, Peter Jang). Branch `hendrick/hw7-benchmark`.

## 1. Claim and baseline

JANG is negotiation infrastructure for agents: a buyer agent and a seller agent negotiate a purchase and the engine signs and audits the agreement against both mandates. A mandate holds hard bounds (a price ceiling or floor, a delivery window, a warranty range, whether a soundbar is included) and a private reservation utility. JANG lets the agents negotiate four terms: price, delivery days, warranty months, soundbar.

**Claim A (closing rate).** In markets where a mutually acceptable package exists, JANG closes more deals than the same agents negotiating price only.

**Claim C (joint value).** The deals JANG closes are worth more to both sides together than price-only deals (higher share of the best available joint surplus, closer to the Pareto frontier).

**Baseline.** The same markets, the same agents, the same round budget (12 rounds), with the three non-price terms pinned to the posted defaults in both mandates, so the engine enforces "price only". Two weaker reference points were also computed: the seller's posted package (take it or leave it) and an oracle price (midpoint of the two private price limits, other terms at defaults). The only difference between JANG and the baseline is how many terms may move.

**Result checks, fixed before looking** (`docs/hw7/protocol.md`, committed in `62e6800` before any fresh seed was run), all independent of the negotiators:

- *Feasible*: an exhaustive search over the item's step lattice finds at least one package inside both mandates. This defines which markets count in the closing-rate denominator.
- *Closed*: a JANG-signed agreement exists and `auditAgreement` passes (signature and both mandates).
- *Efficiency*: (uB - rB + uS - rS) divided by the maximum of the same over feasible packages. *Pareto-optimal*: no feasible lattice package is at least as good for both and better for one.
- Must hold in every run: no agreement in an infeasible market, no constraint violation.

## 2. Setup

**Cases** (generators in `scripts/hw7/lib.ts`). *Ordinary*: the original HW6 market generator, 40 markets per seed. *Narrow ZOPA*: buyer ceiling $0 to $50 above the seller floor, 40. *Asymmetric*: ordinary markets with a much tougher seller (toughness 4.0 instead of 1.6), 40. *No ZOPA*: buyer ceiling $10 to $200 below the seller floor, 20 (a check that nothing closes by mistake). Ordinary and narrow cover typical and hard cases; asymmetric and no-ZOPA cover adversarial ones.

**Rule agents** (`agents/rule-strategy.ts`, in-process, deterministic given the seed). Seeds: tuning `20261028` (inspected while diagnosing), fresh `20261101` and `20261102` (never run before the protocol was committed). 140 markets per seed. 3 seeds x 6 variants x 140 markets x 2 conditions = 5,040 negotiations. No API cost, about 11 ms per negotiation, 77 s for the whole set on one laptop (`npm run hw7:all`). A re-run reproduced all 18 result files exactly, apart from timings and metadata.

**Claude agents** (`scripts/hw7/llm.ts`). Buyer and seller are each a Claude Agent SDK agent (`@anthropic-ai/claude-agent-sdk ^0.3.312`, model `claude-sonnet-5-5`, 80 turns per agent) connected to the live JANG MCP server, run on a Claude subscription. One market per case on fresh seed 20261101, 3 repetitions per condition, same 12-round budget. 60 negotiations in 5 raw files.

**Commands.** `npm run hw7:all` (rule agents and summary), `npm run hw7:llm -- --cases=ordinary,asymmetric --reps=3` (Claude agents), `npm run hw7:summary`, `npm test`, `npm run typecheck`.

## 3. Results

### 3.1 Rule agents, fresh seeds 20261101 + 20261102 (feasible markets only)

| case | feasible | JANG closes | price-only closes | JANG-only / price-only-only | mean efficiency JANG / PO | paired efficiency diff (n, JANG better) |
| --- | --- | --- | --- | --- | --- | --- |
| ordinary, base | 58 | 40 (69%, CI 56-79) | 17 (29%, CI 19-42) | 23 / 0 | 0.80 / 0.79 | -0.002 (17, 6) |
| ordinary, with fix | 58 | 47 (81%, CI 69-89) | 31 (53%, CI 41-66) | 17 / 1 | 0.80 / 0.84 | -0.030 (30, 9) |
| asymmetric, base | 58 | 26 (45%, CI 33-58) | 23 (40%, CI 28-53) | 5 / 2 | 0.82 / 0.81 | 0.007 (21, 10) |
| asymmetric, with fix | 58 | 42 (72%, CI 60-82) | 31 (53%, CI 41-66) | 12 / 1 | 0.77 / 0.82 | -0.003 (30, 13) |
| narrow, with fix | 22 | 4 (18%, CI 7-39) | 0 (0%, CI 0-15) | 4 / 0 | 0.93 / - | - |
| no ZOPA | 0 feasible | 0 agreements | 0 agreements | - | - | - |

"Posted price" and "oracle price" close 3 of 58 feasible ordinary and asymmetric markets (5%) in every variant. Across all variants and seeds there were 0 false agreements and 0 constraint violations. Buyer share of the surplus in closed ordinary deals: about 0.55 (JANG) versus 0.27 (price-only), with the fix. Full per-variant tables are in `results/hw7/SUMMARY.md`.

### 3.2 Claude agents, fresh seed 20261101, 3 repetitions per cell

| case (market) | condition | agreed (complete runs) | mean rounds | efficiency, mean (range) | mean cost per negotiation (USD) | mean time (s) |
| --- | --- | --- | --- | --- | --- | --- |
| ordinary (#2) | JANG | 3/3 | 10.0 | 0.63 (0.33-0.84) | 1.45 | 44 |
| ordinary (#2) | price-only | 3/3 | 11.3 | 0.48 (all 0.48) | 1.48 | 44 |
| asymmetric (#2) | JANG | 3/3 | 11.7 | 0.77 (0.54-0.94) | 2.03 | 60 |
| asymmetric (#2) | price-only | 3/3 | 11.7 | 0.48 (all 0.48) | 1.75 | 46 |
| ordinary (#0) | JANG | 8/8 | 10.4 | 0.92 (0.91-0.94) | 1.61 | 91 |
| ordinary (#0) | price-only | 0/8 | 12.0 | - | 1.92 | 57 |
| narrow (#1) | JANG | 0/5 | 12.0 | - | 2.57 | 150 |
| narrow (#1) | price-only | 0/5 | 12.0 | - | 1.88 | 71 |

Market #0 has 1443 feasible four-term packages and none with price only, so the price-only row cannot close by construction. It is shown as evidence that Claude agents find deals price-only cannot, not as a closing-rate comparison. Asymmetric #0 (not in the table, 4 of 8 JANG runs and 2 of 8 price-only runs complete) gave 4/4 and 0/2. Every price-only deal on market #2 was the same package (price 1220, delivery 14 days, warranty 12 months, no soundbar). Costs are API-equivalent: token counts times list prices, not money actually billed, because the runs used a subscription. Tokens are mostly cache reads, about 5M to 10M input tokens per negotiation. All 60 negotiations cost $84.08 and 60 minutes of agent time, of which the 16 interrupted runs account for $1.93.

## 4. Limit, change and retest

**Limit found on the tuning seed.** Of 16 feasible ordinary markets JANG missed, 12 ended with an agent repeatedly trying to accept a package outside its own hard limits (the rule strategy scored packages by utility only), which JANG refused. Only 4 ran out of rounds. For price-only the figure was 24 of 24. The agent never countered, so the failure was in the agent, not in the negotiation protocol.

**One change ("fix").** The rule agent accepts only packages inside its own mandate and otherwise counters (`respectBounds`, opt-in, shipped defaults unchanged). It was chosen from the tuning seed and then evaluated, without further changes, on the two fresh seeds. We planned two other ideas first and report them as sensitivity checks, not as the change: Option 1, deadline-aware concession, and Option 2, a doubled round budget.

**Retest.**

| ordinary, feasible markets | JANG closes | price-only closes |
| --- | --- | --- |
| tuning seed, base | 17/33 (52%) | 9/33 (27%) |
| tuning seed, fix | 26/33 (79%) | 16/33 (48%) |
| fresh seeds, base | 40/58 (69%) | 17/58 (29%) |
| fresh seeds, fix | 47/58 (81%) | 31/58 (53%) |

The fix helped both sides and helped price-only more, so the closing-rate lead shrank (JANG-only wins 23, then 17 of 58). The bug had inflated JANG's lead, and the tuning-seed gain held on fresh seeds. Sensitivity on fresh seeds, ordinary: Option 1 alone 42/58 versus 19/58; Option 2 alone 40/58 versus 15/58; fix plus Option 1 52/58 (90%) versus 31/58 but mean efficiency drops to 0.74; fix plus Option 2 51/58 (88%), efficiency 0.82. More concession closes more deals and, with Option 1, gives away joint value.

## 5. Interpretation, limits, what is unproven

**Supported.** Claim A holds for the rule agents on ordinary markets (both variants) and on asymmetric markets after the fix: JANG closes more, and price-only closes a deal JANG missed only 0 to 2 times per cell. JANG also closes narrow-ZOPA deals that price-only cannot close at all (no narrow market has a price-only deal). The engine never produced a false agreement or a constraint violation. With Claude agents, the multi-issue market closed in every complete run on market #2 and #0 ordinary, and price-only closed only where a price-only deal existed.

**Not supported.** Claim C fails for the rule agents. Where both close, mean efficiency is about equal or slightly higher for price-only (paired difference -0.030 for ordinary with the fix, JANG better in 9 of 30 pairs), and the Pareto-optimal share is similar (17% versus 19%). JANG splits the surplus more evenly (buyer share 0.55 versus 0.27), which is a different property from efficiency. Claude agents show higher mean efficiency for JANG on market #2 (0.63 and 0.77 versus 0.48) but with 3 runs, a wide spread (0.33 to 0.94) and one market per case, this is a direction, not evidence. On asymmetric markets before the fix, the closing-rate gap (26 versus 23 of 58) is within noise.

**Limits and uncertainty.**

- Markets are synthetic. Utilities are linear and additive, and the same strategy plays both sides. There is no adaptive-retailer baseline and no human negotiators.
- Claude-agent sample: one market per case, 3 repetitions, one seed. The market #2 comparison has no discriminating power on closing rate, since both conditions closed 3/3 by selection.
- **Post-hoc change.** The first Claude batches used ordinary market #0. After seeing that price-only could not close there, we changed the selection rule to require a price-only deal for ordinary and asymmetric, which moved them to market #2. The narrow case keeps the original rule because no narrow market has a price-only deal. This was decided after results were seen. The #0 runs are kept and reported separately.
- **Interrupted runs.** Of the 60 Claude-agent negotiations, 16 ended in an error before finishing: 15 hit the subscription's 5-hour usage limit and 1 hit the 40-turn cap (raised to 80 afterward). All 16 are kept in the raw files, excluded from agreement and efficiency statistics, and included in the cost totals.
- Narrow ZOPA with Claude agents: JANG closed 0 of 5 complete runs although a deal existed. Rule agents closed only 4 of 22 (fix) to 9 of 22 (fix plus Option 2). Narrow markets remain hard.
- The JANG operator can see both mandates, which a real marketplace operator may not. Efficiency is measured on the four-term market even for price-only deals.

**Unproven.** Whether the closing-rate gain holds with real retailers and real buyers, whether the efficiency result changes with smarter multi-issue strategies, and whether Claude agents close more deals than price-only in markets where both can close. Claude-agent latency and cost do not differ clearly between conditions on this sample.

## 6. Team and contributions

**Hendrick Jung** designed and ran the study: the pre-committed protocol, the benchmark
harness with its price-only baseline and exhaustive-search ground truth, all 5,100
negotiations, the diagnosis of the dominant failure mode and the bounds fix for it, the
market design, and this report. **Peter Jang** built JANG itself — the negotiation core,
the REST and MCP interfaces, the agent harnesses and the console — and for this homework
reviewed and merged the experimental work and fixed a fault it exposed in the older
benchmark, whose coarse feasibility oracle could call a real agreement impossible once
the researched economics narrowed the zones. Both of us used Claude Code for
implementation and drafting; every number comes from the raw files in section 7.

## 7. Evidence

Repository github.com/byujan/JANGmarket, branch `main` (merged from
`hendrick/hw7-benchmark`). Protocol: `docs/hw7/protocol.md` (commit `62e6800`, before the fresh seeds). Fresh-seed rule-agent results: commit `ee52691`. Complete Claude-agent batch and final summary: commit `0b0ba0d`. Raw results: `results/hw7/*-seed*.json` (rule agents, 18 files) and `results/hw7/llm-*.json` (Claude agents, 5 files). Pooled tables: `results/hw7/SUMMARY.md`, `results/hw7/summary.json`. Code: `scripts/hw7/`, `agents/rule-strategy.ts`, `agents/runner.ts`.
