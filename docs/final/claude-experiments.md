# Claude-agent checks of the four final changes

Run 2026-11-08/09 by Hendrick (with Claude Code), on top of `hendrick/batna` (PRs #5 to #8). Model: `claude-sonnet-5-5`. Everything here is reproducible from the scripts and seeds below; raw records are in `results/final/`.

**TL;DR**

1. **The new mandate builder (stage 4, #8) is the problem.** Turning the owner's priority *order* into weights (rank-order centroid) throws away how *much* each term matters. That error alone leaves **no possible deal in 53% of feasible narrow markets and 7% of feasible ordinary ones**, before any agent negotiates.
2. **Disclosure looks helpful with Claude agents too.** Efficiency of closed deals rose from 0.64 (before) to 0.73 (MESO + disclosure) and 0.86 (all four). This matches the rule-agent result, but the sample is tiny (9 markets per arm, 1 run each), so treat it as direction, not evidence.
3. **Claude almost never uses MESO.** In 18 sessions where it was available, agents attached alternatives twice. With Claude agents we have not really tested MESO.
4. **No arm produced a deal worse than an owner's true walk-away.** Builder errors show up as missed deals, not bad ones.

Proposed fix for (1): after the ranking, ask one or two magnitude questions ("how much more would you pay for 6 more months of warranty?") so weights carry size, then rerun both experiments.

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

## Code touched (please review, Peter: these are yours)

- `mcp/server.ts`: `JANG_MESO=off` drops `alternatives` from the `offer`/`counter` input schema. Unset, behaviour is unchanged.
- `agents/llm-strategy.ts`: optional `env` passed through to the agent's MCP server.
- New: `scripts/final/elicit-llm.ts`, `scripts/final/llm-all.ts`.

## Limits

- One model, one run per market, 9 markets per arm: direction only, nothing here is significant.
- Experiment 1's owners are told dollar trade-offs, which makes the old slider unusually easy for an LLM.
- In all4 the outside offer is constructed to be worth exactly the true reservation; a real owner's alternative would add its own noise.
