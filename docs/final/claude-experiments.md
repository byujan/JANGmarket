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

**What this means, corrected by the simulation below.** It is tempting to read this as "rank-only weights fail safe, money answers fail unsafe". That is wrong: rank-only weights allow bad packages just as often; the all4 arm simply closed fewer deals, so it signed none of them in 9 runs.

## Can the walk-away be protected against answer error?

`npx tsx scripts/final/guard-sim.ts --draws=10` (no Claude calls; every feasible market on seed 20261101, 10 draws of dollar answers off by about ±30%). Each guard is applied to both owners on top of the lodged mandate. **bad share** is the share of packages both mandates allow that are worse for an owner than their true walk-away; **short>0.05** the share more than 0.05 (utility) below it; **best eff.** the best allowed package's efficiency under the truth (no deal = 0).

| ordinary (154 markets) | no deal | bad share | short>0.05 | best eff. |
| --- | --- | --- | --- | --- |
| rank only (before e4789a1) | 9.4% | 15.6% | 3.4% | 0.896 |
| **money questions, no guard (now)** | **3.5%** | **13.9%** | **2.6%** | **0.966** |
| robust x1.2 | 19.4% | 3.1% | 0.3% | 0.770 |
| robust x1.35 | 31.8% | 0.9% | 0.1% | 0.630 |
| robust x1.5 | 42.0% | 0.3% | 0.0% | 0.514 |
| top term no worse than the outside offer | 41.4% | 11.8% | 2.2% | 0.552 |
| min(money, rank): beat the offer under both weightings | 14.2% | 5.5% | 0.5% | 0.835 |
| min(money, rank, equal) | 28.4% | 3.3% | 0.2% | 0.678 |
| max(money, rank): beat it under either | 0.7% | 21.0% | 4.7% | (counts bad packages) |
| exact weights (floor of the outside-offer step) | 0.3% | 2.2% | 0.0% | 0.996 |

| narrow (57 markets) | no deal | bad share | short>0.05 | best eff. |
| --- | --- | --- | --- | --- |
| rank only | 50.7% | 57.6% | 10.6% | 0.581 |
| **money questions, no guard** | **25.6%** | **56.7%** | **15.0%** | **0.966** |
| robust x1.2 | 73.0% | 32.5% | 5.3% | 0.253 |
| robust x1.35 | 91.6% | 20.7% | 2.2% | 0.075 |
| min(money, rank) | 68.1% | 36.4% | 3.4% | 0.334 |
| max(money, rank) | 8.9% | 62.5% | 15.5% | (counts bad packages) |
| exact weights | 5.3% | 10.0% | 0.0% | 0.987 |

"robust xF": the package must beat the outside offer under every weight vector within a factor F of the lodged one (closed form, since the difference is linear in the weights). "top term": no worse than the outside offer on the term ranked first.

- **The money questions beat rank-only on every count in ordinary markets**: fewer markets with no deal, slightly fewer bad packages, smaller losses, higher reachable efficiency. In narrow markets they halve the dead markets with the same bad share, but more of the bad packages are large losses (15.0% vs 10.6%).
- **Any error in the weights lets some bad packages through**, whatever the method; most are small (mean shortfall about 0.03 utility). Even exact weights with the outside offer valued to within 0.01 leave 2% (ordinary) and 10% (narrow).
- **Guards buy safety with deals.** Robust x1.2 cuts bad packages in ordinary from 13.9% to 3.1% and large losses to 0.3%, but leaves no deal in 19% of markets (from 3.5%) and drops reachable efficiency from 0.97 to 0.77. In narrow markets every guard closes most of them. Top term is dominated: it costs deals and barely helps.
- **Two weightings, min or max** (judge each package under the money weights and the rank-only weights, require both or either): min is a milder guard on the same trade-off (ordinary: no deal 14%, bad 5.5%, versus robust x1.2 at 19% and 3.1%); max is looser than no guard. Neither escapes the trade-off; they are points on it.
- **Recommendation:** keep the money questions as the default. Do not add a guard by default. If one is wanted, offer robust x1.2 as an owner's choice ("be cautious: only take deals clearly better than my alternative") and say what it costs. The lever that helps without costing deals is answer accuracy, which only a test with people can measure.

## Boundary confirmation: show the owner a few deals near the line

Added to `scripts/final/guard-sim.ts` (no Claude calls). After the mandate is built, each owner is shown K packages near their lodged walk-away (those whose verdict a weight error is most likely to flip) with what their agent would do, and answers from their true preferences. A wrong "accept" raises the walk-away above that package; a wrong "refuse" lowers it to that package.

| | ordinary: no deal | bad share | short>0.05 | best eff. | narrow: no deal | bad share | short>0.05 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none (money questions only) | 3.5% | 13.9% | 2.6% | 0.966 | 25.6% | 56.7% | 15.0% |
| **confirm 3** | **2.3%** | **11.9%** | **1.7%** | **0.976** | **22.5%** | **51.4%** | **10.6%** |
| confirm 3, 10% of answers wrong | 2.7% | 12.6% | 2.0% | 0.976 | 24.9% | 55.1% | 11.8% |
| confirm 5 | 2.4% | 11.7% | 1.6% | 0.974 | 21.8% | 50.8% | 10.2% |
| min(money, rank) | 14.2% | 5.5% | 0.5% | 0.835 | 68.1% | 36.4% | 3.4% |
| confirm 3 + min | 13.4% | 4.5% | 0.3% | 0.840 | 67.0% | 34.2% | 2.7% |

- **Confirmation is the first change that improves every number at once**: fewer dead markets, fewer bad packages, fewer large losses, higher reachable efficiency. It survives 10% wrong answers.
- **But the gain is small** (bad share 13.9% to 11.9%), and two more questions add little. It only moves one number, the walk-away; the errors are in the weights' direction, so raising the line to exclude one bad package also cuts good ones elsewhere.
- Next step if pursued: use the answers to correct the weights, not just the walk-away (find weights consistent with every choice, dollar answer and confirmation), and pick each next package from what the previous answers left uncertain.

## Correcting the weights from the answers (Bayesian refit)

Added to `scripts/final/guard-sim.ts` (no Claude calls; M = 100 weight samples per owner, `--samples`). Per owner: sample plausible weights around the dollar answers (log-normal, sigma 0.3), drop those that contradict the owner's ranking, then ask K adaptive questions. Each question shows the package near the line that the samples disagree on most; the answer reweights the samples (the model assumes 5% answer noise). The final mandate uses the weighted mean of the samples ("mean"), or accepts only packages that beat the outside offer in at least 80% of the weighted samples ("80% sure").

| | ordinary: no deal | bad share | short>0.05 | best eff. | narrow: no deal | bad share | short>0.05 | best eff. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none (money questions only) | 3.5% | 13.9% | 2.6% | 0.966 | 25.6% | 56.7% | 15.0% | 0.966 |
| confirm 3 (walk-away only) | 2.3% | 11.9% | 1.7% | 0.976 | 22.5% | 51.4% | 10.6% | 0.959 |
| refit 0 (ranking constraint only) | 4.0% | 11.0% | 1.3% | 0.954 | 29.8% | 45.6% | 6.1% | 0.850 |
| **refit 3** | **1.6%** | **8.3%** | **0.5%** | **0.983** | **15.1%** | **29.5%** | **2.2%** | **0.909** |
| refit 3, 10% of answers wrong | 2.0% | 9.6% | 0.9% | 0.979 | 19.8% | 35.5% | 3.7% | 0.890 |
| refit 5 | 1.2% | 7.3% | 0.5% | 0.989 | 11.4% | 27.7% | 1.9% | 0.958 |
| refit 3, 80% sure | 4.7% | 3.9% | 0.3% | 0.939 | 32.5% | 20.6% | 2.3% | 0.659 |
| robust x1.2 (for comparison) | 19.4% | 3.1% | 0.3% | 0.770 | 73.0% | 32.5% | 5.3% | 0.253 |

- **Correcting the weights works where moving the walk-away did not.** With three questions, ordinary markets lose fewer deals (3.5% to 1.6%), bad packages fall from 13.9% to 8.3% and large losses from 2.6% to 0.5%, and reachable efficiency rises. Narrow markets gain the most: dead markets 25.6% to 15.1%, bad packages 56.7% to 29.5%, large losses 15.0% to 2.2%.
- It holds with 10% wrong answers, and five questions help further.
- **"80% sure" is the best safety option found**: about as safe as robust x1.2 in ordinary markets (3.9% vs 3.1% bad) but losing 4.7% of markets instead of 19.4%, with efficiency 0.94 instead of 0.77.
- Caveats: the model's noise assumption (sigma 0.3) matches the simulated owners exactly, which flatters it; real answers may err differently. M = 100 samples. Questions are chosen adaptively, so in the product they must be computed in the browser after each answer (100 to 300 samples is cheap).
- **Now in the product** ("Check a few deals" in the mandate builder, after the outside offer): `startRefit`, `refitCandidates`, `nextCheck`, `answerCheck`, `refittedWeights` in `elicit.ts` (200 samples, the "mean" rule), up to three yes/no questions, optional. The "80% sure" rule is not in the product: the engine judges a package by one weight vector and one walk-away, so it would need an engine change. Checked in the browser on the Cambridge rental: questions appear only once an alternative is described, three answers end in "Done", and changing anything above resets them with a note.

## Rerun with "Check a few deals" in Claude negotiations

`JANG_LLM_MODEL=claude-sonnet-5-5 npx tsx scripts/final/llm-all.ts --markets=3 --arms=all4+refit` → `results/final/llm-all-2026-11-09T15-35-29-874Z.json` (5 valid runs) + `llm-all-2026-11-09T18-02-04-984Z.json` (the 4 runs a usage limit cut short, rerun with `--only`). Arm all4+refit: the same markets, outside offers and dollar answers as all4+money, then each owner answers the three checks truthfully, with the product's own `startRefit` / `nextCheck` / `answerCheck`.

| arm | closed | below an owner's true walk-away | largest shortfall |
| --- | --- | --- | --- |
| before | 7/9 | 0 | none |
| all4 (rank only) | 4/9 | 0 | none |
| all4+money | 7/9 | 2 | 0.120 (asymmetric #3) |
| **all4+refit** | **5/9** | **3** | **0.015** |

- **The large loss is gone.** In asymmetric #3 the checks raised the buyer's walk-away (0.272 to 0.310) and the bad deal could no longer be signed; the same happened to narrow #1's seller.
- **Small losses remain, and there were three of them**: asymmetric #2 (buyer 0.361 vs 0.367), narrow #9 (buyer 0.252 vs 0.267), ordinary #2 (seller 0.336 vs 0.348). All within 0.015 of the walk-away. Hard-bargaining agents push deals to the edge of what the mandate allows, so any remaining weight error shows up as a slightly bad deal.
- Closing fell from 7/9 to 5/9: two markets became no-deal because the checks protected an owner (asymmetric #3, narrow #1), and asymmetric #0 failed although a deal was possible.
- This matches the simulation: refit removes most large losses (short>0.05: 2.6% to 0.5% in ordinary) but leaves many small ones. Removing those too needs a margin or the "80% sure" rule, which costs deals (next section). One run per market, 9 markets: direction only.

## A safety margin on top of the refit

`npx tsx scripts/final/guard-sim.ts --draws=10` (no Claude calls), new rows "refit K +m": after the refit, a package must beat the outside offer by m (utility) under the refitted weights, i.e. the walk-away is raised by m. **unsafe** (some allowed package is below an owner's true walk-away) is the number that matters for Claude agents, since they push to the edge of what the mandate allows.

| guard | ordinary: no deal | unsafe | bad share | best eff. | narrow: no deal | unsafe | bad share | best eff. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| refit 3 | 1.6% | 97.1% | 8.3% | 0.983 | 15.1% | 71.1% | 29.5% | 0.909 |
| refit 3 +0.01 | 3.6% | 86.9% | 5.3% | 0.953 | 27.5% | 40.2% | 22.7% | 0.745 |
| refit 3 +0.02 | 6.5% | 69.1% | 3.5% | 0.923 | 42.6% | 23.5% | 19.9% | 0.560 |
| refit 3 +0.03 | 9.1% | 51.4% | 2.3% | 0.894 | 58.1% | 14.4% | 19.3% | 0.402 |
| refit 3 +0.05 | 16.4% | 24.9% | 1.2% | 0.817 | 78.8% | 6.0% | 22.3% | 0.209 |
| refit 5 +0.02 | 6.0% | 63.6% | 2.9% | 0.927 | 40.2% | 24.0% | 17.9% | 0.574 |
| refit 3, 80% sure | 4.7% | 84.7% | 3.9% | 0.939 | 32.5% | 40.2% | 20.6% | 0.659 |
| exact weights | 0.3% | 72.5% | 2.2% | 0.996 | 5.3% | 64.0% | 10.0% | 0.987 |

- **A margin works in ordinary markets.** +0.02 cuts bad share from 8.3% to 3.5% (about what exact weights give) for 5 more points of no-deal; it is about as good as "80% sure", and needs no engine change (it is just a higher walk-away).
- **In narrow markets it is expensive.** Each +0.01 roughly doubles the no-deal rate (15% to 28% to 43%), and bad share barely moves past +0.01: the bad deals left there are not near the line, so a margin mostly removes good ones.
- **Even exact weights leave tiny losses** (unsafe 72.5%, mean shortfall 0.003): part of what Claude showed (0.006 to 0.015) is unavoidable rounding at the edge, not elicitation error.
- **Asking more does not substitute** (refit 5 +0.02 is close to refit 3 +0.02), and answer errors (10% wrong) weaken the margin.
- Suggestion (one counterparty only; see the next section for several): if we add one, make it small (+0.01) or let the owner choose it ("leave me some room"), and show it as part of the walk-away. We have not added it to the product.

## The margin when an owner can try another counterparty

The margin numbers above are one buyer against one seller, so a no-deal looks like a pure loss. In a marketplace the owner can try someone else, and a no-deal means taking the outside offer (worth exactly the walk-away), not nothing. `npx tsx scripts/final/multi-sim.ts --draws=10 --n=1,2,3,5 --margins=0,0.01,0.02,0.03,0.05` → `results/final/multi-sim-2026-11-09.txt` (no Claude calls). One focal owner (buyer, then seller) meets up to N counterparties in turn and takes the first with which both mandates allow something. Counterparty 1 is the market's own other side (N = 1 is the setting above); the others come from other markets of the same case, re-anchored so each pair's price overlap is that market's (narrow stays narrow with everyone). The focal owner answers the questions once, so the same weight error follows them to every counterparty. **gain** is the focal owner's true utility minus their true walk-away (no deal = 0): **avg** over the packages the deal allows, **edge** at the one worst for them (where a hard bargainer pushes).

| case | margin | N | no deal | bad risk | gain avg | gain edge | counterparties met |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 0 | 1 | 1.9% | 87.4% | 0.088 | -0.024 | 1.00 |
| ordinary | 0 | 5 | 0.0% | 89.1% | 0.090 | -0.024 | 1.03 |
| ordinary | +0.03 | 1 | 9.4% | 31.4% | 0.092 | +0.004 | 1.00 |
| ordinary | +0.03 | 3 | 1.7% | 33.6% | 0.100 | +0.005 | 1.14 |
| ordinary | +0.05 | 3 | 4.6% | 14.6% | 0.106 | +0.024 | 1.25 |
| narrow | 0 | 1 | 14.5% | 50.7% | 0.024 | -0.003 | 1.00 |
| narrow | 0 | 5 | 5.0% | 55.0% | 0.028 | -0.002 | 1.37 |
| narrow | +0.02 | 1 | 45.1% | 13.0% | 0.021 | +0.007 | 1.00 |
| narrow | +0.02 | 3 | 26.4% | 15.3% | 0.030 | +0.011 | 1.80 |
| narrow | +0.02 | 5 | 19.1% | 16.1% | 0.033 | +0.012 | 2.28 |

- **With other counterparties, the margin pays.** In narrow markets +0.02 loses value with one counterparty (avg gain 0.021 vs 0.024) but wins from two on (0.030 vs 0.027 at N = 3, 0.033 vs 0.028 at N = 5), and the edge outcome turns from a loss (-0.002) into a gain (+0.012). Most deals a margin blocks are recovered with the next counterparty, and the ones that come through are better for the owner.
- **Without a margin, more counterparties do not help safety.** Bad risk stays (or grows slightly: 50.7% to 55.0% in narrow) because the owner's weight error comes along to every negotiation.
- **Ordinary markets barely need a second try** (1.03 to 1.25 counterparties met on average); +0.03 to +0.05 raises avg gain and makes the edge positive.
- **The cost is search**: in narrow markets +0.02 means meeting 2.3 counterparties on average at N = 5, i.e. more time and more agent runs. It also assumes other counterparties exist and are as tight as the first; a thin market behaves like N = 1.
- So the earlier "a margin is too expensive in narrow markets" holds only when there is no one else to try. If JANG matches an owner with several counterparties, a default margin of about +0.02 is worth it. Not in the product yet.

## Getting Claude to use MESO

`npx tsx scripts/final/llm-all.ts --markets=3 --arms=meso+disclose --meso-guide` → `results/final/llm-all-2026-11-09T14-19-22-080Z.json` (9 negotiations, about $33)

Three nudges, all opt-in with `JANG_MESO_GUIDE=on` (and never when `JANG_MESO=off`):
- `agents/prompts/meso.md`, inserted into both prompts: when to offer alternatives, how to build them, what the reply tells you.
- On the agent's turn, `get_session` reminds it that it may attach alternatives.
- After an offer with alternatives, `get_session` says which of the agent's own packages the counter came closest to (computed from offers both sides have seen, so nothing new leaks).

Same 9 markets as the earlier meso+disclose arm:

| | closed | eff. of closed | realised eff. | Pareto | buyer share | offers with alternatives | cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before | 7/9 | 0.64 | 0.50 | 1/7 | 0.20 | 0 | $20 |
| meso+disclose, no guide | 6/9 | 0.73 | 0.49 | 2/6 | 0.23 | 0 | $17 |
| meso+disclose, guided | 5/9 | 0.70 | 0.39 | 0/5 | 0.13 | 101 of 101 | $33 |

- **The nudge works on behaviour:** Claude attached alternatives to every offer, and 3 of the 5 deals were closed on an alternative.
- **It does not help outcomes:** one fewer deal, realised efficiency 0.49 to 0.39 (guided better on 2 markets, worse on 4), no Pareto-optimal deal, and the buyer's share fell further. It roughly doubles the cost, and one run hit the 80-turn limit (ordinary #0).
- This matches the rule-agent benchmark, where MESO alone had no measurable effect. A plausible reason: Claude's "equally good" alternatives are not equally good, or are spread on terms that do not reveal much. A tool that computes alternatives of equal value from the agent's own mandate would test that; not built.
- **Decision:** the guidance stays opt-in; default prompts are unchanged.

## Code touched (please review, Peter: these are yours)

- `mcp/server.ts`: `JANG_MESO=off` drops `alternatives` from the `offer`/`counter` input schema. Unset, behaviour is unchanged.
- `agents/llm-strategy.ts`: optional `env` passed through to the agent's MCP server; opt-in MESO guidance (`JANG_MESO_GUIDE=on`, `agents/prompts/meso.md`).
- `mcp/server.ts` also gains the opt-in MESO hints in `get_session` (turn reminder, closest package).
- `src/lib/jang/elicit.ts` (+ tests) and `src/components/MandateBuilder.tsx`: the money questions above.
- New: `scripts/final/elicit-llm.ts`, `scripts/final/llm-all.ts` (now with an `all4+money` arm), `scripts/final/magnitude-sim.ts`, `scripts/final/guard-sim.ts` (guards, boundary confirmation, Bayesian refit).

## Limits

- One model, one run per market, 9 markets per arm: direction only, nothing here is significant.
- Experiment 1's owners are told dollar trade-offs, which makes the old slider unusually easy for an LLM.
- In all4 the outside offer is constructed to be worth exactly the true reservation; a real owner's alternative would add its own noise.
