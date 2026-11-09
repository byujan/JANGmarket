# HW7 results

Generated from 24 result files by `scripts/hw7/summarize.ts`.

Closing rate is over markets where a deal was feasible (exhaustive search). Pareto, efficiency and buyer share are over closed deals, scored against the full four-term market. Rounds and ms are per negotiation, over all markets.

## Fresh seeds 20261101 + 20261102

### variant `fix`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 47/58 (81%) | 69-89% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 17 / 1 | 8/47 (17%) | 6/31 (19%) | 0.80 | 0.84 | -0.030 (30, 9) | 0.55 | 0.27 | 11.4 | 11.3 | 9.6 | 0 | 0 |
| narrow | 22/80 | 4/22 (18%) | 7-39% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 4 / 0 | 3/4 (75%) | - | 0.93 | - | - (0, 0) | 0.63 | - | 12.0 | 12.0 | 11.4 | 0 | 0 |
| asymmetric | 58/80 | 42/58 (72%) | 60-82% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 12 / 1 | 2/42 (5%) | 6/31 (19%) | 0.77 | 0.82 | -0.003 (30, 13) | 0.46 | 0.21 | 11.7 | 11.7 | 9.4 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.4 | 0 | 0 |

### variant `fix+meso`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 48/58 (83%) | 71-90% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 18 / 1 | 8/48 (17%) | 6/31 (19%) | 0.80 | 0.84 | -0.023 (30, 10) | 0.53 | 0.27 | 11.3 | 11.3 | 13.0 | 0 | 0 |
| narrow | 22/80 | 4/22 (18%) | 7-39% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 4 / 0 | 3/4 (75%) | - | 0.93 | - | - (0, 0) | 0.63 | - | 12.0 | 12.0 | 12.7 | 0 | 0 |
| asymmetric | 58/80 | 43/58 (74%) | 62-84% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 13 / 1 | 2/43 (5%) | 6/31 (19%) | 0.74 | 0.82 | -0.035 (30, 13) | 0.50 | 0.21 | 11.6 | 11.7 | 12.7 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 13.3 | 0 | 0 |

### variant `fix+disclose`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 54/58 (93%) | 84-97% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 23 / 0 | 17/54 (31%) | 6/31 (19%) | 0.84 | 0.84 | 0.012 (31, 13) | 0.53 | 0.27 | 11.2 | 11.3 | 10.4 | 0 | 0 |
| narrow | 22/80 | 13/22 (59%) | 39-77% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 13 / 0 | 11/13 (85%) | - | 0.91 | - | - (0, 0) | 0.57 | - | 12.0 | 12.0 | 11.6 | 0 | 0 |
| asymmetric | 58/80 | 47/58 (81%) | 69-89% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 16 / 0 | 13/47 (28%) | 6/31 (19%) | 0.85 | 0.82 | 0.049 (31, 15) | 0.42 | 0.21 | 11.5 | 11.7 | 9.7 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.5 | 0 | 0 |

### variant `fix+disclose1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 49/58 (84%) | 73-92% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 19 / 1 | 9/49 (18%) | 6/31 (19%) | 0.81 | 0.84 | 0.010 (30, 13) | 0.52 | 0.27 | 11.4 | 11.3 | 9.6 | 0 | 0 |
| narrow | 22/80 | 7/22 (32%) | 16-53% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 7 / 0 | 5/7 (71%) | - | 0.78 | - | - (0, 0) | 0.23 | - | 12.0 | 12.0 | 11.6 | 0 | 0 |
| asymmetric | 58/80 | 43/58 (74%) | 62-84% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 12 / 0 | 6/43 (14%) | 6/31 (19%) | 0.77 | 0.82 | 0.020 (31, 14) | 0.42 | 0.21 | 11.7 | 11.7 | 9.8 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.3 | 0 | 0 |

### variant `fix+meso+disclose`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 55/58 (95%) | 86-98% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 24 / 0 | 18/55 (33%) | 6/31 (19%) | 0.85 | 0.84 | 0.008 (31, 12) | 0.53 | 0.27 | 11.2 | 11.3 | 12.5 | 0 | 0 |
| narrow | 22/80 | 14/22 (64%) | 43-80% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 14 / 0 | 12/14 (86%) | - | 0.89 | - | - (0, 0) | 0.60 | - | 12.0 | 12.0 | 12.5 | 0 | 0 |
| asymmetric | 58/80 | 47/58 (81%) | 69-89% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 16 / 0 | 10/47 (21%) | 6/31 (19%) | 0.83 | 0.82 | 0.019 (31, 14) | 0.45 | 0.21 | 11.5 | 11.7 | 11.8 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 12.7 | 0 | 0 |

### variant `fix+meso+disclose1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 51/58 (88%) | 77-94% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 20 / 0 | 10/51 (20%) | 6/31 (19%) | 0.80 | 0.84 | 0.000 (31, 14) | 0.54 | 0.27 | 11.3 | 11.3 | 12.5 | 0 | 0 |
| narrow | 22/80 | 9/22 (41%) | 23-61% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 9 / 0 | 6/9 (67%) | - | 0.70 | - | - (0, 0) | 0.32 | - | 12.0 | 12.0 | 12.4 | 0 | 0 |
| asymmetric | 58/80 | 44/58 (76%) | 63-85% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 13 / 0 | 2/44 (5%) | 6/31 (19%) | 0.73 | 0.82 | -0.040 (31, 13) | 0.50 | 0.21 | 11.6 | 11.7 | 11.8 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 12.3 | 0 | 0 |

### variant `fix+option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 51/58 (88%) | 77-94% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 21 / 1 | 10/51 (20%) | 6/31 (19%) | 0.82 | 0.83 | -0.011 (30, 10) | 0.52 | 0.28 | 22.8 | 22.4 | 19.6 | 0 | 0 |
| narrow | 22/80 | 9/22 (41%) | 23-61% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 9 / 0 | 7/9 (78%) | - | 0.90 | - | - (0, 0) | 0.54 | - | 24.0 | 24.0 | 22.2 | 0 | 0 |
| asymmetric | 58/80 | 44/58 (76%) | 63-85% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 14 / 1 | 2/44 (5%) | 6/31 (19%) | 0.79 | 0.82 | 0.016 (30, 18) | 0.40 | 0.21 | 23.3 | 23.1 | 19.4 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 21.2 | 0 | 0 |

### variant `fix+option2+meso`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 58/80 | 52/58 (90%) | 79-95% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 22 / 1 | 9/52 (17%) | 6/31 (19%) | 0.81 | 0.83 | -0.016 (30, 8) | 0.52 | 0.28 | 22.7 | 22.4 | 25.5 | 0 | 0 |
| narrow | 22/80 | 10/22 (45%) | 27-65% | 0/22 (0%) | 0-15% | 0/22 (0%) | 0/22 (0%) | 10 / 0 | 8/10 (80%) | - | 0.89 | - | - (0, 0) | 0.51 | - | 24.0 | 24.0 | 29.6 | 0 | 0 |
| asymmetric | 58/80 | 47/58 (81%) | 69-89% | 31/58 (53%) | 41-66% | 3/58 (5%) | 3/58 (5%) | 16 / 0 | 3/47 (6%) | 6/31 (19%) | 0.75 | 0.82 | -0.022 (31, 16) | 0.43 | 0.21 | 23.2 | 23.1 | 36.0 | 0 | 0 |
| nozopa | 0/40 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 48.6 | 0 | 0 |

## Tuning seed 20261028

### variant `fix`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 26/33 (79%) | 62-89% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 11 / 1 | 5/26 (19%) | 1/16 (6%) | 0.83 | 0.78 | -0.010 (15, 7) | 0.56 | 0.31 | 11.5 | 11.5 | 9.9 | 0 | 0 |
| narrow | 12/40 | 3/12 (25%) | 9-53% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 3 / 0 | 1/3 (33%) | - | 0.82 | - | - (0, 0) | 0.70 | - | 12.0 | 12.0 | 11.5 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 0/22 (0%) | 0/16 (0%) | 0.76 | 0.77 | 0.018 (15, 8) | 0.48 | 0.30 | 11.7 | 11.8 | 9.3 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.1 | 0 | 0 |

### variant `fix+meso`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 26/33 (79%) | 62-89% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 11 / 1 | 5/26 (19%) | 1/16 (6%) | 0.84 | 0.78 | 0.016 (15, 9) | 0.55 | 0.31 | 11.4 | 11.5 | 12.8 | 0 | 0 |
| narrow | 12/40 | 4/12 (33%) | 14-61% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 4 / 0 | 2/4 (50%) | - | 0.87 | - | - (0, 0) | 0.60 | - | 12.0 | 12.0 | 12.5 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 1/22 (5%) | 0/16 (0%) | 0.74 | 0.77 | -0.000 (15, 9) | 0.54 | 0.30 | 11.7 | 11.8 | 13.0 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 14.0 | 0 | 0 |

### variant `fix+disclose`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 29/33 (88%) | 73-95% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 13 / 0 | 8/29 (28%) | 1/16 (6%) | 0.86 | 0.78 | 0.063 (16, 10) | 0.55 | 0.31 | 11.3 | 11.5 | 10.0 | 0 | 0 |
| narrow | 12/40 | 6/12 (50%) | 25-75% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 6 / 0 | 5/6 (83%) | - | 0.88 | - | - (0, 0) | 0.44 | - | 11.9 | 12.0 | 12.0 | 0 | 0 |
| asymmetric | 33/40 | 25/33 (76%) | 59-87% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 10 / 1 | 6/25 (24%) | 0/16 (0%) | 0.85 | 0.77 | 0.074 (15, 13) | 0.44 | 0.30 | 11.6 | 11.8 | 9.6 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.2 | 0 | 0 |

### variant `fix+disclose1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 25/33 (76%) | 59-87% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 9 / 0 | 5/25 (20%) | 1/16 (6%) | 0.83 | 0.78 | 0.036 (16, 9) | 0.53 | 0.31 | 11.5 | 11.5 | 9.9 | 0 | 0 |
| narrow | 12/40 | 4/12 (33%) | 14-61% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 4 / 0 | 4/4 (100%) | - | 0.96 | - | - (0, 0) | 0.57 | - | 12.0 | 12.0 | 11.4 | 0 | 0 |
| asymmetric | 33/40 | 23/33 (70%) | 53-83% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 8 / 1 | 2/23 (9%) | 0/16 (0%) | 0.76 | 0.77 | 0.029 (15, 9) | 0.45 | 0.30 | 11.7 | 11.8 | 9.6 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 10.8 | 0 | 0 |

### variant `fix+meso+disclose`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 29/33 (88%) | 73-95% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 13 / 0 | 8/29 (28%) | 1/16 (6%) | 0.86 | 0.78 | 0.066 (16, 10) | 0.56 | 0.31 | 11.3 | 11.5 | 12.3 | 0 | 0 |
| narrow | 12/40 | 6/12 (50%) | 25-75% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 6 / 0 | 6/6 (100%) | - | 0.92 | - | - (0, 0) | 0.53 | - | 11.9 | 12.0 | 12.7 | 0 | 0 |
| asymmetric | 33/40 | 25/33 (76%) | 59-87% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 10 / 1 | 6/25 (24%) | 0/16 (0%) | 0.82 | 0.77 | 0.046 (15, 11) | 0.48 | 0.30 | 11.5 | 11.8 | 11.9 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 12.6 | 0 | 0 |

### variant `fix+meso+disclose1`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 25/33 (76%) | 59-87% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 9 / 0 | 6/25 (24%) | 1/16 (6%) | 0.84 | 0.78 | 0.034 (16, 9) | 0.52 | 0.31 | 11.5 | 11.5 | 12.6 | 0 | 0 |
| narrow | 12/40 | 5/12 (42%) | 19-68% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 5 / 0 | 5/5 (100%) | - | 0.97 | - | - (0, 0) | 0.57 | - | 12.0 | 12.0 | 12.4 | 0 | 0 |
| asymmetric | 33/40 | 23/33 (70%) | 53-83% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 8 / 1 | 1/23 (4%) | 0/16 (0%) | 0.75 | 0.77 | -0.002 (15, 10) | 0.51 | 0.30 | 11.6 | 11.8 | 11.9 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 12.0 | 12.0 | 12.1 | 0 | 0 |

### variant `fix+option2`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 29/33 (88%) | 73-95% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 13 / 0 | 4/29 (14%) | 1/16 (6%) | 0.83 | 0.78 | 0.032 (16, 7) | 0.54 | 0.31 | 22.8 | 22.8 | 19.5 | 0 | 0 |
| narrow | 12/40 | 5/12 (42%) | 19-68% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 5 / 0 | 3/5 (60%) | - | 0.88 | - | - (0, 0) | 0.60 | - | 23.9 | 24.0 | 20.9 | 0 | 0 |
| asymmetric | 33/40 | 22/33 (67%) | 50-80% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 7 / 1 | 2/22 (9%) | 0/16 (0%) | 0.79 | 0.77 | 0.054 (15, 11) | 0.40 | 0.27 | 23.5 | 23.4 | 19.9 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 21.0 | 0 | 0 |

### variant `fix+option2+meso`

| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 33/40 | 29/33 (88%) | 73-95% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 13 / 0 | 5/29 (17%) | 1/16 (6%) | 0.84 | 0.78 | 0.035 (16, 10) | 0.51 | 0.31 | 22.7 | 22.8 | 25.5 | 0 | 0 |
| narrow | 12/40 | 5/12 (42%) | 19-68% | 0/12 (0%) | 0-24% | 0/12 (0%) | 0/12 (0%) | 5 / 0 | 3/5 (60%) | - | 0.88 | - | - (0, 0) | 0.60 | - | 23.9 | 24.0 | 29.2 | 0 | 0 |
| asymmetric | 33/40 | 24/33 (73%) | 56-85% | 16/33 (48%) | 33-65% | 2/33 (6%) | 2/33 (6%) | 9 / 1 | 4/24 (17%) | 0/16 (0%) | 0.79 | 0.77 | 0.077 (15, 12) | 0.41 | 0.27 | 23.4 | 23.4 | 24.7 | 0 | 0 |
| nozopa | 0/20 | - | - | - | - | - | - | 0 / 0 | - | - | - | - | - (0, 0) | - | - | 24.0 | 24.0 | 25.8 | 0 | 0 |

