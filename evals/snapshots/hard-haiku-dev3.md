Model `haiku` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 32878 | +0% | +0% |  | 48/48 | 137.5 / None | 0/48 | - | 0/48 |
| c0-control | 35204 | +7% | -20% |  | 48/48 | 125.5 / None | 0/48 | - | 0/48 |
| c1-brief | 35141 | +7% | -19% |  | 48/48 | 116.5 / None | 0/48 | - | 0/48 |
| c2-very | 30452 | -7% | -23% |  | 48/48 | 121.5 / None | 0/48 | - | 0/48 |
| c3-concise-draft | 28100 | -15% | -21% |  | 48/48 | 116.0 / None | 0/48 | - | 0/48 |
| c4-fewest | 33874 | +3% | -14% |  | 48/48 | 115.5 / None | 0/48 | - | 0/48 |
| c5-norepeat | 32942 | +0% | -18% |  | 48/48 | 112.5 / None | 0/48 | - | 0/48 |
| c6-draft-concise | 34358 | +5% | -16% |  | 46/48 | 113.5 / None | 0/48 | - | 0/48 |
| c7-direct | 31358 | -5% | -15% |  | 47/48 | 120.0 / None | 0/48 | - | 0/48 |
| c8-scratch | 32270 | -2% | -21% |  | 48/48 | 133.5 / None | 0/48 | - | 0/48 |
| c9-short | 30332 | -8% | -19% |  | 47/48 | 117.5 / None | 0/48 | - | 0/48 |

- c0-control thought less than baseline on 21/24 prompts.
- c1-brief thought less than baseline on 20/24 prompts.
- c2-very thought less than baseline on 21/24 prompts.
- c3-concise-draft thought less than baseline on 20/24 prompts.
- c4-fewest thought less than baseline on 19/24 prompts.
- c5-norepeat thought less than baseline on 20/24 prompts.
- c6-draft-concise thought less than baseline on 19/24 prompts.
- c7-direct thought less than baseline on 18/24 prompts.
- c8-scratch thought less than baseline on 21/24 prompts.
- c9-short thought less than baseline on 19/24 prompts.
