# HW7 handoff memo (Hendrick to Peter)

Written 2026-11-03. **Deadline: Wednesday 2026-11-04, 11:59 PM ET.** Only one person on the team needs to upload the PDF to Canvas.
Branch: `hendrick/hw7-benchmark`, already pushed to `byujan/JANGmarket`. Pull request: https://github.com/byujan/JANGmarket/pull/4

## 1. Where things stand

All experiments are done and the report draft (3-page PDF) is finished. What is left is **four things for you** (section 3).

## 2. What Hendrick did

- Benchmark harness: four market generators, the price-only baseline, and an exhaustive-search ground truth (feasible, Pareto, efficiency). Files: `scripts/hw7/lib.ts`, `run.ts`, `summarize.ts`.
- Protocol (claims, conditions, result checks, seeds), committed before looking at the fresh-seed results: `docs/hw7/protocol.md`, commit `62e6800`.
- Rule-agent experiments: 3 seeds x 6 variants, 5,040 negotiations in total. Fresh-seed results are in commit `ee52691`.
- Found the cause of most failures on the tuning seed, made one change (the "fix": an agent accepts only packages inside its own mandate), and retested it on the two fresh seeds.
- Claude-agent experiments (`scripts/hw7/llm.ts`): 60 negotiations, $84.08 API-equivalent cost, about 60 minutes.
- Reproduction check: re-ran `npm run hw7:all`. All 18 result files are identical to the committed ones, apart from timings and metadata.
- Checked `npm test` (36 passing) and `npm run typecheck` (clean).
- Report draft: `docs/hw7/HW7_report.md` and `docs/hw7/HW7_report.pdf`. Written with Claude Code's help; every number comes from `results/hw7/`.

Key commits: `62e6800` (protocol), `ee52691` (fresh-seed results), `0b0ba0d` (finished Claude batch and final summary), `2a6a064` and `043cc02` (report and PDF).

## 3. What you need to do

1. **Read the PDF.** `docs/hw7/HW7_report.pdf`. If a sentence is wrong or you disagree with an interpretation, edit `docs/hw7/HW7_report.md`. If you change a number, check it against `results/hw7/SUMMARY.md`.
2. **Fill in section 6, "Team and contributions".** It currently holds only the placeholder `[To be written by Hendrick Jung and Peter Jang.]`. Write what each of us did, concretely.
3. **Change the repository's visibility.** `github.com/byujan/JANGmarket` is **PRIVATE**, so graders cannot open the evidence links. Either (a) make it public, or (b) give the graders access. Hendrick's account (`Hendrick-Jung`) has push access but not admin access, so **only you, as the repository owner, can do this.** On 2026-11-03 we checked that `.env.local` (Clerk secret keys) appears nowhere in the git history of any branch (`git log --all -- .env.local` returned nothing). Run that check once more right before going public.
4. **Get the branch and commit your changes to it.** The branch is already on the remote. Run `git fetch origin && git checkout hendrick/hw7-benchmark`, edit section 6, and commit to the same branch. The report cites commits `62e6800`, `ee52691` and `0b0ba0d`, which are on the remote now. Once the repo is visible to graders, add the repository URL to section 7 of the report.

Then **rebuild the PDF** and upload it to Canvas (one upload for the team is enough).

## 4. Rebuilding the PDF after edits

Edit `docs/hw7/HW7_report.md`, then:

```
npm run hw7:pdf
```

That sets up a throwaway virtualenv in `.venv-hw7` the first time (the system Python
refuses to install into itself on macOS, so `pip install markdown` as written below does
not work), converts the markdown, and prints to PDF with headless Chrome. It reports the
page count when it finishes.

If Chrome is not where the script looks for it, the script says so and leaves the HTML
for you to print by hand (Letter size, headers and footers off). Keep the report short if
you can, and check that no heading ends up alone at the bottom of a page, away from its
table.

## 5. What the report claims, and what it does not (for questions)

- **Claim A (closing rate):** holds for the rule agents. Ordinary markets: JANG 47/58 versus price-only 31/58 after the fix. Supported.
- **Claim B (joint value, efficiency):** **does not hold** for the rule agents. Mean efficiency is about equal or slightly higher for price-only. We reported it as a negative result.
- **Claude agents:** JANG's mean efficiency is higher, but with n=3 and a wide spread the report calls it a direction, not evidence.
- **Effect of the fix:** it helped price-only too, so JANG's lead shrank. In other words, the bug had been inflating JANG's lead.

## 6. Facts you should know (all already disclosed in the report)

1. **Post-hoc change.** After seeing the first Claude-agent results, we changed the market selection rule (ordinary and asymmetric moved from market #0 to #2), because price-only cannot close on #0 by construction. The #0 runs are kept as a separate row, not deleted.
2. **16 of the 60 Claude-agent runs were interrupted.** 15 hit the subscription's 5-hour usage limit and 1 hit the 40-turn cap. All are kept in the raw files, excluded from agreement and efficiency statistics, and included in the cost total. Their cost is $1.93.
3. **Costs are "API-equivalent".** The runs used a subscription, so this is token counts times list prices, not money actually billed.
4. **All 6 price-only agreements on market #2 are the same package** (price 1220, delivery 14 days, warranty 12 months, no soundbar). We did not check why, so the report states only the fact.
5. **The repo being private** is mentioned only in this memo, not in the report.
6. **The pull request lists 14 commits**, not only HW7 ones. The first four come from earlier work (`hendrick/personas`, TV clearance) that was merged into this branch and is not on `main` yet. Many commit messages also end with a `Co-Authored-By: Claude` line, and two of them carry a link to a Claude Code session. None of this affects the submission.

## 7. Please do not

- Re-run the fresh seeds (`20261101`, `20261102`) to get nicer numbers, and do not change the protocol after the fact. If anything is changed after results were seen, it must be written down in the report.
- Read, print or commit `.env.local`. Do not commit `.DS_Store`, `.agents/` or `skills-lock.json` either.
- Turn on `respectBounds` or `deadlineAware` by default. They must stay opt-in.
- Use em dashes in the report (house style).
- Claim more than the evidence supports. Small samples and failures stay as they are.

## 8. Where things are

| What | Where |
| --- | --- |
| Report (source, PDF) | `docs/hw7/HW7_report.md`, `docs/hw7/HW7_report.pdf` |
| Protocol (committed before the fresh-seed results) | `docs/hw7/protocol.md` |
| Detailed handoff (written for Claude Code) | `docs/hw7/HANDOFF.md` |
| Summary tables (source of every number) | `results/hw7/SUMMARY.md`, `results/hw7/summary.json` |
| Raw rule-agent results (18 files) | `results/hw7/*-seed*.json` |
| Raw Claude-agent results (5 files) | `results/hw7/llm-*.json` |
| PDF build script | `scripts/hw7/md2html.py` |
