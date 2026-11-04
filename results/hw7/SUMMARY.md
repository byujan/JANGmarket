# HW7 results

Generated from 18 result files by `scripts/hw7/summarize.ts`.

Closing rate is over markets where a deal was feasible (exhaustive search). Pareto, efficiency and buyer share are over closed deals, scored against the full four-term market. Rounds and ms are per negotiation, over all markets.

## Fresh seeds 20261101 + 20261102

### variant `base`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 40/58 (69%) | 56-79% | 17/58 (29%) | 19-42% | 3/58 (5%) | 3/58 (5%) | 23 / 0 | 3/40 (8%) | 1/17 (6%) | 0.80 | 0.79 | -0.002 (17, 6) | 0.56 | 0.33 | 11.2 | 10.1 | 11.1 | 0 | 0 |
| narrow | 22/80 | 0/22 (0%) | 0-15% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.4 | 10.1 | 12.4 | 0 | 0 |
| asymmetric | 58/80 | 26/58 (45%) | 33-58% | 23/58 (40%) | 28-53% | 3/58 (5%) | 3/58 (5%) | 5 / 2 | 0/26 (0%) | 2/23 (9%) | 0.82 | 0.81 | 0.007 (21, 10) | 0.48 | 0.23 | 11.1 | 11.0 | 11.4 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.5 | 10.2 | 11.6 | 0 | 0 |

### variant `fix`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 47/58 (81%) | 69-89% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 17 / 1 | 8/47 (17%) | 6/31 (19%) | 0.80 | 0.84 | -0.030 (30, 9) | 0.55 | 0.27 | 11.4 | 11.3 | 10.9 | 0 | 0 |
| narrow | 22/80 | 4/22 (18%) | 7-39% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 4 / 0 | 3/4 (75%) | - | 0.93 | - | - (0, 0) | 0.63 | - | 12.0 | 12.0 | 10.9 | 0 | 0 |
| asymmetric | 58/80 | 42/58 (72%) | 60-82% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 12 / 1 | 2/42 (5%) | 6/31 (19%) | 0.77 | 0.82 | -0.003 (30, 13) | 0.46 | 0.21 | 11.7 | 11.7 | 10.4 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.6 | 0 | 0 |

### variant `option1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 42/58 (72%) | 60-82% | 19/58 (33%) | 22-46% | 3/58 (5%) | 3/58 (5%) | 23 / 0 | 1/42 (2%) | 1/19 (5%) | 0.71 | 0.80 | -0.056 (19, 6) | 0.32 | 0.26 | 10.8 | 10.1 | 10.8 | 0 | 0 |
| narrow | 22/80 | 0/22 (0%) | 0-15% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.2 | 10.1 | 12.4 | 0 | 0 |
| asymmetric | 58/80 | 40/58 (69%) | 56-79% | 26/58 (45%) | 33-58% | 3/58 (5%) | 3/58 (5%) | 14 / 0 | 1/40 (3%) | 2/26 (8%) | 0.76 | 0.81 | -0.016 (26, 8) | 0.21 | 0.17 | 11.1 | 11.0 | 10.8 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.3 | 10.2 | 11.4 | 0 | 0 |

### variant `option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 40/58 (69%) | 56-79% | 15/58 (26%) | 16-38% | 3/58 (5%) | 3/58 (5%) | 25 / 0 | 3/40 (8%) | 1/15 (7%) | 0.82 | 0.80 | 0.016 (15, 6) | 0.51 | 0.33 | 22.5 | 20.0 | 20.2 | 0 | 0 |
| narrow | 22/80 | 0/22 (0%) | 0-15% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 23.3 | 20.3 | 23.6 | 0 | 0 |
| asymmetric | 58/80 | 31/58 (53%) | 41-66% | 22/58 (38%) | 27-51% | 3/58 (5%) | 3/58 (5%) | 10 / 1 | 0/31 (0%) | 2/22 (9%) | 0.81 | 0.81 | 0.014 (21, 12) | 0.40 | 0.24 | 22.7 | 22.1 | 20.1 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 23.4 | 20.4 | 23.7 | 0 | 0 |

### variant `fix+option1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 52/58 (90%) | 79-95% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 21 / 0 | 9/52 (17%) | 6/31 (19%) | 0.74 | 0.83 | -0.084 (31, 8) | 0.32 | 0.23 | 11.2 | 11.3 | 10.6 | 0 | 0 |
| narrow | 22/80 | 5/22 (23%) | 10-43% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 5 / 0 | 5/5 (100%) | - | 0.90 | - | - (0, 0) | 0.54 | - | 11.9 | 12.0 | 10.8 | 0 | 0 |
| asymmetric | 58/80 | 46/58 (79%) | 67-88% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 15 / 0 | 1/46 (2%) | 5/31 (16%) | 0.73 | 0.81 | -0.020 (31, 9) | 0.23 | 0.17 | 11.5 | 11.6 | 10.4 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.7 | 0 | 0 |

### variant `fix+option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 51/58 (88%) | 77-94% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 21 / 1 | 10/51 (20%) | 6/31 (19%) | 0.82 | 0.83 | -0.011 (30, 10) | 0.52 | 0.28 | 22.8 | 22.4 | 19.6 | 0 | 0 |
| narrow | 22/80 | 9/22 (41%) | 23-61% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 9 / 0 | 7/9 (78%) | - | 0.90 | - | - (0, 0) | 0.54 | - | 24.0 | 24.0 | 22.5 | 0 | 0 |
| asymmetric | 58/80 | 44/58 (76%) | 63-85% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 14 / 1 | 2/44 (5%) | 6/31 (19%) | 0.79 | 0.82 | 0.016 (30, 18) | 0.40 | 0.21 | 23.3 | 23.1 | 19.6 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 23.1 | 0 | 0 |

## Tuning seed 20261028

### variant `base`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 17/33 (52%) | 35-67% | 9/33 (27%) | 15-44% | 2/33 (6%) | 2/33 (6%) | 8 / 0 | 1/17 (6%) | 0/9 (0%) | 0.81 | 0.78 | 0.048 (9, 5) | 0.58 | 0.34 | 11.2 | 10.3 | 11.5 | 0 | 0 |
| narrow | 12/40 | 0/12 (0%) | 0-24% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.4 | 10.2 | 12.6 | 0 | 0 |
| asymmetric | 33/40 | 12/33 (36%) | 22-53% | 10/33 (30%) | 17-47% | 2/33 (6%) | 2/33 (6%) | 3 / 1 | 0/12 (0%) | 0/10 (0%) | 0.83 | 0.79 | 0.088 (9, 7) | 0.45 | 0.33 | 11.2 | 11.0 | 11.1 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.8 | 10.6 | 11.3 | 0 | 0 |

### variant `fix`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 26/33 (79%) | 62-89% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 11 / 1 | 5/26 (19%) | 1/16 (6%) | 0.83 | 0.78 | -0.010 (15, 7) | 0.56 | 0.31 | 11.5 | 11.5 | 10.7 | 0 | 0 |
| narrow | 12/40 | 3/12 (25%) | 9-53% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 3 / 0 | 1/3 (33%) | - | 0.82 | - | - (0, 0) | 0.70 | - | 12.0 | 12.0 | 10.6 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 0/22 (0%) | 0/16 (0%) | 0.76 | 0.77 | 0.018 (15, 8) | 0.48 | 0.30 | 11.7 | 11.8 | 10.5 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.7 | 0 | 0 |

### variant `option1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 21/33 (64%) | 47-78% | 12/33 (36%) | 22-53% | 2/33 (6%) | 2/33 (6%) | 9 / 0 | 5/21 (24%) | 0/12 (0%) | 0.81 | 0.78 | 0.040 (12, 7) | 0.39 | 0.23 | 10.9 | 10.2 | 11.0 | 0 | 0 |
| narrow | 12/40 | 0/12 (0%) | 0-24% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 10.9 | 10.2 | 11.6 | 0 | 0 |
| asymmetric | 33/40 | 19/33 (58%) | 41-73% | 13/33 (39%) | 25-56% | 2/33 (6%) | 2/33 (6%) | 6 / 0 | 0/19 (0%) | 0/13 (0%) | 0.78 | 0.77 | 0.032 (13, 7) | 0.25 | 0.23 | 11.1 | 11.0 | 10.8 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 11.6 | 10.6 | 11.0 | 0 | 0 |

### variant `option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 21/33 (64%) | 47-78% | 9/33 (27%) | 15-44% | 2/33 (6%) | 2/33 (6%) | 12 / 0 | 1/21 (5%) | 0/9 (0%) | 0.82 | 0.78 | 0.099 (9, 5) | 0.54 | 0.36 | 22.4 | 20.3 | 20.8 | 0 | 0 |
| narrow | 12/40 | 0/12 (0%) | 0-24% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 22.9 | 20.1 | 23.1 | 0 | 0 |
| asymmetric | 33/40 | 17/33 (52%) | 35-67% | 12/33 (36%) | 22-53% | 2/33 (6%) | 2/33 (6%) | 5 / 0 | 1/17 (6%) | 0/12 (0%) | 0.82 | 0.78 | 0.077 (12, 10) | 0.42 | 0.29 | 22.9 | 22.3 | 20.0 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 23.6 | 20.9 | 23.9 | 0 | 0 |

### variant `fix+option1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 30/33 (91%) | 76-97% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 15 / 1 | 7/30 (23%) | 1/16 (6%) | 0.82 | 0.77 | -0.021 (15, 7) | 0.39 | 0.23 | 11.2 | 11.4 | 10.7 | 0 | 0 |
| narrow | 12/40 | 4/12 (33%) | 14-61% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 4 / 0 | 1/4 (25%) | - | 0.67 | - | - (0, 0) | 0.58 | - | 11.9 | 12.0 | 11.0 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 1/22 (5%) | 0/16 (0%) | 0.75 | 0.75 | 0.009 (15, 7) | 0.25 | 0.22 | 11.5 | 11.7 | 10.4 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.9 | 0 | 0 |

### variant `fix+option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 29/33 (88%) | 73-95% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 13 / 0 | 4/29 (14%) | 1/16 (6%) | 0.83 | 0.78 | 0.032 (16, 7) | 0.54 | 0.31 | 22.8 | 22.8 | 20.1 | 0 | 0 |
| narrow | 12/40 | 5/12 (42%) | 19-68% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 5 / 0 | 3/5 (60%) | - | 0.88 | - | - (0, 0) | 0.60 | - | 23.9 | 24.0 | 22.5 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 2/22 (9%) | 0/16 (0%) | 0.79 | 0.77 | 0.054 (15, 11) | 0.40 | 0.27 | 23.5 | 23.4 | 19.8 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 23.4 | 0 | 0 |

## Claude agents

Pooled from 5 files (llm-2026-11-03T21-19-43-179Z.json, llm-2026-11-03T21-25-20-875Z.json, llm-2026-11-03T22-30-25-723Z.json, llm-2026-11-03T22-41-30-605Z.json, llm-2026-11-04T03-49-57-602Z.json). Every negotiation is one row of the raw files and none is dropped. A run that ended in an error (for example the subscription's usage limit) is counted as incomplete and left out of the agreed count and the per-run averages. "Deal possible" is the exhaustive-search check for that condition's own market (price-only markets have the other terms pinned), so a condition whose market had no possible deal cannot close.

| case | market # | condition | runs | incomplete | deal possible | agreed (of complete) | audit failures | mean rounds | efficiency mean (min-max) | mean seconds | mean tokens in / out | mean API-equivalent USD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| asymmetric | 0 | jang | 8 | 4 | yes | 4/4 | 0 | 11.3 | 0.92 (0.90-0.94) | 99 | 6496176 / 7120 | 1.81 |
| asymmetric | 0 | priceOnly | 8 | 6 | no | 0/2 | 0 | 12.0 | - | 61 | 8004491 / 7008 | 2.16 |
| asymmetric | 2 | jang | 3 | 0 | yes | 3/3 | 0 | 11.7 | 0.77 (0.54-0.94) | 60 | 7534286 / 8103 | 2.03 |
| asymmetric | 2 | priceOnly | 3 | 0 | yes | 3/3 | 0 | 11.7 | 0.48 (0.48-0.48) | 46 | 6070362 / 6431 | 1.75 |
| narrow | 1 | jang | 8 | 3 | yes | 0/5 | 0 | 12.0 | - | 150 | 10438381 / 9961 | 2.57 |
| narrow | 1 | priceOnly | 8 | 3 | no | 0/5 | 0 | 12.0 | - | 71 | 6874433 / 6992 | 1.88 |
| ordinary | 0 | jang | 8 | 0 | yes | 8/8 | 0 | 10.4 | 0.92 (0.91-0.94) | 91 | 4792594 / 5774 | 1.61 |
| ordinary | 0 | priceOnly | 8 | 0 | no | 0/8 | 0 | 12.0 | - | 57 | 6928550 / 6970 | 1.92 |
| ordinary | 2 | jang | 3 | 0 | yes | 3/3 | 0 | 10.0 | 0.63 (0.33-0.84) | 44 | 4793247 / 6113 | 1.45 |
| ordinary | 2 | priceOnly | 3 | 0 | yes | 3/3 | 0 | 11.3 | 0.48 (0.48-0.48) | 44 | 4793082 / 5814 | 1.48 |

Totals over all 60 negotiations (including incomplete ones): 84.08 USD API-equivalent, 60 minutes of wall-clock time.

