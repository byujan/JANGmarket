# HW7 handoff (for a new Claude Code session)

Read this file first, then `docs/hw7/protocol.md`, then `results/hw7/SUMMARY.md`.
Branch: `hendrick/hw7-benchmark`. Working directory: this repo (JANGmarket).

## 1. The job

Course MAS.665 AI Studio, Homework 7: "Benchmark Your Agentic System". Hendrick Jung and Peter Jang
are one team (project JANG, negotiation infrastructure for agents). One short **PDF in English** is
due **Wednesday 4 Nov 2026, 11:59 PM ET**, uploaded to Canvas by each team member.

The PDF must contain: the claim, baseline, experimental setup, a results table or graph, links to
supporting execution evidence, the failure or limitation, the change and retest, what remains
unproven, enough detail for someone else to repeat the comparison, and a team list with each
person's contribution.

Grading (10 points). Quality of the comparison and evidence is graded, not whether results are positive.
- Clear claim and meaningful baseline (2): measurable claim, result check fixed in advance, simpler baseline on the same tasks, inputs and resource limits, differences explained.
- Actual experiments, measurements, checkable evidence (4): ordinary and difficult cases, how cases were chosen, success checks set before looking, independent checks, repetitions, number of cases and runs, time and model/API cost, setup detail to repeat it.
- Evidence-driven change and retest (2): a limit motivates one change, comparable retest, tuning cases kept apart from fresh checks. The retest need not improve.
- Honest interpretation and limitations (2): what the evidence supports, where it fails or stops helping, what is unproven, uncertainty. Do not grade production readiness or polish.

Keep credentials and private data out of the PDF and the repo.

## 2. Where things stand

Everything below is committed on this branch (not pushed unless the user has done it).

- `scripts/hw7/lib.ts`: market generators (4 cases), the price-only baseline, exhaustive-search ground truth (feasible set, Pareto frontier, efficiency), in-process negotiation runner.
- `scripts/hw7/run.ts`: rule-agent experiment. `--seed`, `--variant=base|fix|option1|option2|fix+option1|fix+option2`.
- `scripts/hw7/summarize.ts`: pools `results/hw7/*.json` into `results/hw7/SUMMARY.md` and `summary.json`.
- `scripts/hw7/llm.ts`: Claude-agent runs (Agent SDK + the JANG MCP server), logs tokens, API-equivalent cost and time.
- `docs/hw7/protocol.md`: claims, conditions, result checks, cases, seeds, the change, and a section on the Claude-agent revision. Committed before the fresh seeds were run.
- `agents/rule-strategy.ts`: new opt-in options `respectBounds` (the fix) and `deadlineAware` (Option 1). Defaults are off, so shipped behaviour is unchanged.
- `agents/runner.ts`: stops an agent that is refused 3 times in a row for the same reason (it used to spin until a 200-turn cap).
- `results/hw7/`: per-market rows for 3 seeds x 6 variants, and 4 Claude-agent files.

### The experiment in one paragraph

Condition JANG: all four terms negotiable (price, delivery days, warranty months, soundbar).
Baseline "price only": the same market with the three non-price terms pinned to the posted
defaults in both mandates, so the engine enforces it. Secondary baselines: posted price and an
oracle midpoint price. Cases: ordinary (40 markets), narrow ZOPA (40), asymmetric toughness (40),
no ZOPA (20), per seed. Seeds: tuning 20261028, fresh 20261101 and 20261102. "Deal possible" is an
exhaustive search over the item's step lattice, independent of the negotiators. Claim A: JANG
closes more of the possible deals than price only. Claim C: JANG deals have higher joint value
(efficiency, Pareto-optimal share).

### Findings so far (verify every number against SUMMARY.md before using it)

- The tuning seed showed that most failures were not "ran out of rounds". The rule agent tried to
  accept packages outside its own hard limits, JANG refused, and the agent never countered. This
  hurt the price-only baseline most. The change ("fix", `respectBounds`) was chosen from that
  evidence on the tuning seed and checked on the two fresh seeds. Option 1 (deadline-aware
  concession) and Option 2 (double round budget) were planned first and are reported as sensitivity.
- Fresh seeds, ordinary case, 58 possible deals: base JANG 40 vs price-only 17; with the fix JANG 47 vs 31.
  Claim A holds, and the gap shrinks once the bug is fixed (so the bug had inflated JANG's lead).
- Claim C does not hold on mean efficiency (price-only slightly higher where both close). JANG
  splits the surplus more evenly (buyer share about 0.55 vs 0.27). Report this as a negative result.
- Narrow ZOPA: JANG closes a few, price-only none (no price-only deal exists in any narrow market).
- No false agreements and no constraint violations anywhere.
- Claude agents: the first batches used ordinary market #0, which has no price-only deal
  (1443 possible packages with four terms, 0 with price only), so price-only could not close by
  construction. Selection was then changed (after seeing results) to require a price-only deal for
  ordinary and asymmetric, which moves them to market #2. This post-hoc change must be disclosed in
  the report. Market #0 rows stay in the results as "Claude agents find deals where price-only cannot".
  Several runs were cut off by the subscription's 5-hour usage limit and are recorded as incomplete.

## 3. What is left, in order

1. **Run the pending Claude-agent batch** (needs the user's Claude login, which Claude Code on the Mac has):
   `npm run hw7:llm -- --cases=ordinary,asymmetric --reps=3` (12 negotiations, roughly 15 to 20 minutes,
   about 1.5 to 2 USD API-equivalent per negotiation). Each negotiation is saved when it finishes. If the usage
   limit stops it, wait for the reset and re-run the same command; incomplete runs are kept and counted.
   Do not delete or hide failed runs.
2. `npm run hw7:summary`, then read the "Claude agents" table in `results/hw7/SUMMARY.md`.
3. **Run the existing checks** and fix any regression caused by the `agents/runner.ts` change:
   `npm test`, `npm run typecheck`. Optionally `npm run hw7:all` to reproduce the rule-agent results
   (closing rates must match the committed SUMMARY.md; only timings differ).
4. **Write the report** (English, short, about 3 to 4 pages) as `docs/hw7/HW7_report.md`, then produce
   `docs/hw7/HW7_report.pdf`. Convert with `pandoc` if installed; otherwise write HTML and print it to PDF
   with headless Chrome or the browser's print dialog. Suggested outline, one section per rubric item:
   1. Claim and baseline (claims A and C, result checks, the four conditions and what differs)
   2. Setup (cases and how they were generated, seeds, repetitions, number of markets and runs, resource costs, exact commands)
   3. Results (one table for rule agents on the fresh seeds, one for Claude agents; cost and time columns)
   4. Limit, change and retest (the bug story, tuning seed vs fresh seeds, Options 1 and 2 as sensitivity)
   5. Interpretation, limitations, what remains unproven (synthetic markets, linear additive utility, same
      strategy on both sides, tiny Claude-agent sample, no adaptive-retailer baseline, the operator can see
      mandates, post-hoc market selection for the Claude runs)
   6. Team and contributions: **leave a placeholder.** Hendrick and Peter write this themselves.
   7. Evidence links (repo path and commit hash of the branch; raw result files; protocol.md)
5. Verify: every number in the report must be traceable to a row in `results/hw7/*.json` or to SUMMARY.md.
   Re-run `npm run hw7:summary` and diff against what the report says.
6. Commit. Do not push without asking. Before the user pushes, check the repo's visibility, because
   graders must be able to open the evidence links (if private, say so and suggest alternatives).

## 4. Guardrails

- Never commit or print `.env.local` (Clerk secrets). Do not commit `.DS_Store`, `.agents/` or `skills-lock.json`.
- Do not change shipped defaults (`respectBounds` and `deadlineAware` stay opt-in) without asking.
- Do not re-run the fresh seeds to "improve" them, and do not change the protocol retroactively. Anything
  changed after results were seen must be written down as such.
- Do not claim more than the evidence supports. Small samples and failures are reported as they are.
- Write the report without em dashes and keep it concise.
- Hendrick wrote most of the HW7 work and Peter did most of HW6. Contributions text is theirs to write.
- If `tsx` fails on a machine, run a script with `node --experimental-transform-types --no-warnings <script>`.
- Reference plans (Claude Docs, may not be readable from here): English https://claude.ai/artifact/AqKFo64fqgJL7XpL1jMGCG , Korean https://claude.ai/artifact/LvWZJq97EsGHvs96aJKnbt
