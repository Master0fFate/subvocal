Model `haiku` via `claude-cli`, 24 task prompts x 4 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 38005 | +0% | +0% |  | 95/96 | 136.5 / 504.5 | 1/102 | 1/1 | 0/102 |
| plain | 32652 | -14% | -17% |  | 95/96 | 126.5 / 393.0 | 0/102 | 1/1 | 0/102 |
| subvocal | 32056 | -16% | -19% |  | 96/96 | 120.5 / 407.5 | 0/102 | 1/1 | 0/102 |
| ultrasubvocal | 28990 | -24% | -26% |  | 93/96 | 111.5 / 448.5 | 0/102 | 1/1 | 0/102 |
| u3-very | 30892 | -19% | -26% |  | 95/96 | 111.0 / 427.0 | 0/102 | 1/1 | 0/102 |

- plain thought less than baseline on 21/24 prompts.
- subvocal thought less than baseline on 21/24 prompts.
- ultrasubvocal thought less than baseline on 22/24 prompts.
- u3-very thought less than baseline on 23/24 prompts.
