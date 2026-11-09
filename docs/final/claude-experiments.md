# Claude-agent checks of the four final changes

Run 2026-11-08/09 by Hendrick (with Claude Code), on top of `hendrick/batna` (PRs #5 to #8). Model: `claude-sonnet-5-5`. Everything here is reproducible from the scripts and seeds below; raw records are in `results/final/`.

**TL;DR**

1. **The new mandate builder (stage 4, #8) is the problem.** Turning the owner's priority *order* into weights (rank-order centroid) throws away how *much* each term matters. That error alone leaves **no possible deal in 53% of feasible narrow markets and 7% of feasible ordinary ones**, before any agent negotiates.
2. **Disclosure looks helpful with Claude agents too.** Efficiency of closed deals rose from 0.64 (before) to 0.73 (MESO + disclosure) and 0.86 (all four). This matches the rule-agent result, but the sample is tiny (9 markets per arm, 1 run each), so treat it as direction, not evidence.
3. **Claude almost never uses MESO.** In 18 sessions where it was available, agents attached alternatives twice. With Claude agents we have not really tested MESO.
4. **No arm produced a deal worse than an owner's true walk-away.** Builder errors show up as missed deals, not bad ones.

**Fix, now in this PR:** after the ranking, the builder asks what each other term is worth in money ("how much more would you pay to get delivery in 3 days instead of 30?"); `weightsFromSwings` in `elicit.ts` turns the answers into weights, and the ranking stays as a consistency check. See "The fix" below.

## Experiment 1: does the new questionnaire recover what owners want?

`npx tsx scripts/final/elicit-llm.ts --owners=16` → `results/final/elicit-llm-2026-11-09T04-31-00-735Z.json` (about $7.80)

16 simulated TV buyers, each a Claude instance with hidden true weights (Dirichlet) and a concrete outside offer, told the way a person knows them: limits, dollar trade-offs ("a week sooner is worth about $X"), and the offer. Each owner fills in the **old** form (1 to 5 importance sliders, 0 to 0.80 walk-away slider) and the **new** one (package choices via `elicit.ts`, then "what would you do instead"), in separate stateless calls. Each mandate is scored on 4,000 random packages: how often the agent's accept/refuse call differs from the owner's.

| arm | order right (tau) | reservation error | bad accepts | missed deals | wrong calls |
| --- | --- | --- | --- | --- | --- |
| old (sliders) | 0.84 | 0.016 | 1.8% | 5.7% | **4.5%** |
| new (choices + alternative) | **1.00** | 0.056 | 4.0% | 7.8% | **8.1%** |
| old weights + new reservation | 0.84 | 0.027 | 3.1% | 4.5% | 5.2% |
| new weights + old walk-away | 1.00 | 0.016 | 2.7% | 8.4% | 6.7% |
| true order + ROC (ceiling of new) | 1.00 | 0.056 | 4.0% | 7.8% | 8.1% |

New better for 4 owners, worse for 12 (sign test p = 0.077).

- Claude answered the new questions perfectly: 16/16 orders right, 16/16 alternatives reported exactly. The new arm equals its own ceiling, so **all of its error is rank-order centroid**, and the reservation inherits it because the alternative is valued under the wrong weights.
- **Caveat that favours the old form:** given dollar values, Claude can compute a 0 to 1 walk-away score almost exactly (error 0.016). People cannot, which was the point of the change. So this does not show the new form is worse *for people*; it shows the rank-to-weight step is the weak link.

## Experiment 2: all four changes, negotiated by Claude

`npx tsx scripts/final/llm-all.ts --markets=3` → `results/final/llm-all-2026-11-09T04-42-55-508Z.json` (27 negotiations, about $57)

Fresh seed 20261101; the first three feasible markets of ordinary, narrow and asymmetric (stubborn seller), same personas as `scripts/hw7/llm.ts`. Three arms on the same markets:

- **before**: MESO hidden from the MCP tools (`JANG_MESO=off`), no disclosure, mandates exactly as the market defines them.
- **meso+disclose**: MESO available, both owners disclose their priority order, true mandates.
- **all4**: as meso+disclose, plus each mandate is what the new builder would lodge: ROC weights from the owner's true order, and the reservation value of an outside offer worth exactly the owner's true reservation.

The frontier and operator checks (#7) run server side in every arm and never reach agents. **Every deal is scored against the true market.**

| arm | closed | eff. of closed deals | realised eff. (fail = 0) | Pareto | buyer share | below true reservation |
| --- | --- | --- | --- | --- | --- | --- |
| before | 7/9 | 0.64 | 0.50 | 1/7 | 0.20 | 0 |
| meso+disclose | 6/9 | 0.73 | 0.49 | 2/6 | 0.23 | 0 |
| all4 | **4/9** | **0.86** | 0.38 | 1/4 | 0.26 | 0 |

- **All five all4 failures were decided before negotiation:** under the elicited mandates no deal was possible (narrow #1, #6, #9; ordinary #3; asymmetric #3). On the four markets where one was, all4 closed 4/4.
- MESO offers: 0 in every arm except all4 narrow #1 (2 offers).
- Noise is large: asymmetric #3 closed in *before* but failed in *meso+disclose*, a market where a deal was possible. One run per market.
- One run hit the 80-turn limit (narrow #1, before, buyer).

### How often the new builder removes every deal (no Claude calls)

`npx tsx scripts/final/llm-all.ts --feasibility --cases=ordinary,narrow`, every feasible market on seed 20261101, 20 outside offers per owner:

| case | feasible markets | no deal left, ROC weights only | no deal left, full new builder |
| --- | --- | --- | --- |
| ordinary | 154 | 11 (7%) | 306/3080 (10%) |
| narrow | 57 | 30 (53%) | 563/1140 (49%) |

## The fix: ask how much, in money

`src/lib/jang/elicit.ts` gains `weightsFromSwings(money, swings, anchors)` (swing weighting: each term's weight is what moving it from limit to best is worth, in units of the money term's whole range) and `swingConflicts` (pairs where the amounts contradict the choices, shown to the owner, nothing overridden). `MandateBuilder.tsx` adds a "How much is each worth to you?" section when one term is in USD; if any amount is blank, the ranking alone sets the weights as before. Five new tests in `elicit.test.ts`.

**Simulated owners, with an honest error in their money answers** (`npx tsx scripts/final/magnitude-sim.ts --draws=10`, no Claude calls, every feasible market on seed 20261101):

| weights | ordinary: no deal left | ordinary: efficiency lost | narrow: no deal left | narrow: efficiency lost |
| --- | --- | --- | --- | --- |
| ROC (rank only, before this fix) | 8.2% | 10.2% | 49.6% | 56.2% |
| money answers, ±30% error | **4.0%** | **7.4%** | **30.5%** | **35.6%** |
| money answers, ±50% error | 6.3% | 12.1% | 36.7% | 50.6% |
| exact weights (floor from the outside-offer step) | 1.9% | 2.0% | 7.0% | 8.9% |
| ROC, walk-away 0.03 below the offer | 2.5% | 4.3% | 26.3% | 35.4% |

Lowering the walk-away is not a fix: it raises the share of allowed deals an owner would truly refuse from 15% to 26% (ordinary) and 45% to 66% (narrow). Narrow markets stay fragile under any elicitation: with exact weights, misvaluing the outside offer by 0.01 still closes 7% of them.

**Claude owners answering the new section** (`elicit-llm.ts`, rerun with a third arm; `results/final/elicit-llm-2026-11-09T05-24-19-701Z.json`; 12 of 16 owners, the last four hit a usage limit): wrong accept/refuse calls fall to **0.1%** (old sliders 4.3%, ranking only 8.5%), better than the old sliders for 12 of 12 owners (p = 0.0005). This mostly shows the plumbing is right: these owners were *told* their dollar trade-offs, so they answer almost exactly. How well people answer is the open question; the ±30%/±50% rows above are the realistic range.

## Rerun: the fixed builder in Claude negotiations

`npx tsx scripts/final/llm-all.ts --markets=3 --arms=all4+money` → `results/final/llm-all-2026-11-09T13-33-57-412Z.json` (9 negotiations, about $19)

Arm **all4+money**: as all4, but weights come from the money questions, with each owner's dollar answers off by a log-normal factor (sigma 0.3, about ±30%). Same markets and same outside offers as all4, so only the weights differ. Before negotiating, all 9 markets still allow a deal (all4: 4 of 9).

| arm | closed | eff. of closed deals | Pareto | deals below an owner's TRUE walk-away |
| --- | --- | --- | --- | --- |
| before | 7/9 | 0.64 | 1/7 | 0 |
| meso+disclose | 6/9 | 0.73 | 2/6 | 0 |
| all4 (rank only) | 4/9 | 0.86 | 1/4 | 0 |
| **all4+money** | **7/9** | see below | 1/7 | **2** |

- **Closing is back to where it was before the changes** (7/9), from 4/9.
- **But two deals were worse for an owner than walking away**, the first in any arm:
  - narrow #1: both sides land just under their true walk-away (buyer 0.296 vs 0.300, seller 0.335 vs 0.343). Small in value; the efficiency of -4.13 only looks dramatic because a narrow market's whole surplus is tiny.
  - asymmetric #3: serious. The buyer gets 0.176 against a true walk-away of 0.296. Their dollar answers overvalued the soundbar by about 50% and undervalued delivery, so under the lodged weights a deal at the price limit, minimum warranty and 39-day delivery plus a soundbar looked acceptable.
- Mean efficiency of closed deals is distorted by the narrow #1 outlier; excluding it, the other six average 0.55, below before (0.64) and all4 (0.86). One run per market, so this is direction only.

**What this means.** Rank-only weights fail safe (they lose deals); noisy money answers fail unsafe (they can lower the walk-away the agent effectively applies). The money questions fix closing, but the walk-away now needs protection against error in the weights. Candidate fix, not built: accept a package only if it beats the outside offer under every weight vector within the owner's likely error (for example ±30% on each amount), or simply never below the outside offer on any term the owner ranked above the rest. Either can be checked in this script before touching the product.

## Code touched (please review, Peter: these are yours)

- `mcp/server.ts`: `JANG_MESO=off` drops `alternatives` from the `offer`/`counter` input schema. Unset, behaviour is unchanged.
- `agents/llm-strategy.ts`: optional `env` passed through to the agent's MCP server.
- `src/lib/jang/elicit.ts` (+ tests) and `src/components/MandateBuilder.tsx`: the money questions above.
- New: `scripts/final/elicit-llm.ts`, `scripts/final/llm-all.ts` (now with an `all4+money` arm), `scripts/final/magnitude-sim.ts`.

## Limits

- One model, one run per market, 9 markets per arm: direction only, nothing here is significant.
- Experiment 1's owners are told dollar trade-offs, which makes the old slider unusually easy for an LLM.
- In all4 the outside offer is constructed to be worth exactly the true reservation; a real owner's alternative would add its own noise.
